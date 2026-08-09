import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import {
	cards,
	importCategoryMappings,
	inboxItems,
	openFinanceConnections,
	transactions,
} from "@/db/schema";
import {
	banSeriesByAnchor,
	loadIgnoredSeriesAnchors,
	loadIgnoredSeriesKeys,
	serializeSeriesKey,
} from "@/features/openfinance/lib/ignored-series";
import {
	getBill,
	getItem,
	listAccounts,
	listTransactions,
	PluggyApiError,
	type PluggyTransaction,
} from "@/features/openfinance/lib/pluggy-client";
import {
	isCanceledInstallment,
	serializeAnchor,
	seriesAnchorFromTransaction,
} from "@/features/openfinance/lib/series-anchor";
import { deriveCreditCardPeriod } from "@/features/transactions/lib/form-helpers";
import { normalizeDescriptionKey } from "@/features/transactions/lib/import-utils";
import { db } from "@/shared/lib/db";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { getBusinessDateString } from "@/shared/utils/date";
import {
	addMonthsToPeriod,
	comparePeriods,
	derivePeriodFromDate,
	getCurrentPeriod,
} from "@/shared/utils/period";

/**
 * Sincronização pura de UMA conexão Open Finance (Pluggy) → Inbox.
 *
 * Função server-only, chamável isoladamente (testável por script). NÃO instala
 * gancho no dashboard nem lida com UI/flag — isso é Entrega 2.
 *
 * Regras cravadas (PLAN-openfinance-fase1 §4):
 * - Throttle 1x/h por `lastSyncedAt`.
 * - Só processa a account Pluggy vinculada (não chama listAccounts).
 * - Dedup Camada 1: `onConflictDoNothing` no índice (userId, externalSourceId).
 * - Dedup Camada 2: conteúdo já existente (pending→posted troca id) → INSERE
 *   assim mesmo com `possibleDuplicate = true` + prefixo em originalTitle.
 *   NUNCA suprime, NUNCA deleta.
 * - Valor COM sinal em parsedAmount (a Inbox deriva direção do sinal).
 * - Erro da Pluggy: engole, loga sem credencial, retorna resultado de erro.
 */

const SOURCE_APP = "openfinance";
const THROTTLE_MS = 60 * 60 * 1000; // 1h
const BACKFILL_DAYS = 90; // primeiro sync
// ⚠️ Janela de sync filtra pela DATA DA COMPRA (`dateFrom` do /v2/transactions),
// NÃO pela data de importação (`createdAtFrom`). Motivo (prova empírica ago/2026,
// ver listTransactions em pluggy-client.ts): a Pluggy carimba `createdAt` no dia da
// conexão e NÃO atualiza — então filtrar o incremental por `createdAtFrom = ontem`
// retornava VAZIO mesmo com compras/parcelas novas na fatura, e a fatura "congelava"
// no que veio no backfill (bug real: parcelas do MP 13,03/16,01 POSTED na Pluggy
// nunca entravam). Filtrando por `dateFrom`, o incremental re-varre uma janela de
// datas de compra e pega o que apareceu/mudou (pending→posted, parcela ganhando
// billId). O dedup de 2 camadas absorve a sobreposição (Camada 1 = onConflictDoNothing
// por id externo → nada duplica). A janela incremental re-varre INCREMENTAL_WINDOW_DAYS
// para cobrir um ciclo de fatura inteiro + atraso de lançamento do banco.
const INCREMENTAL_WINDOW_DAYS = 45;
const DUPLICATE_PREFIX = "[possível duplicata] ";
const MISSING_DESCRIPTION = "(sem descrição)";

// Horizonte de PROJEÇÃO de parcelas futuras ausentes. O emissor (ex.: Mercado
// Pago) gera as parcelas de uma compra parcela-a-parcela, ao fechar cada fatura —
// então uma compra de 5x às vezes só tem a 1/5 na Pluggy. Projetamos as parcelas
// FUTURAS ausentes para a fatura ficar completa sem espera nem lançamento manual;
// a parcela real substitui a projeção quando chega (casa por âncora + número).
// ⚠️ Só projetamos parcela do mês ATUAL ou FUTURO (>= mês atual) e dentro deste
// horizonte: projetar RETROATIVO reintroduziria parcelas em faturas já pagas (bug
// real que os dados do Nubank expuseram — ele tem séries antigas/quitadas incompletas
// que NÃO devem ganhar projeção; todas de meses passados, cobertas pela trava). O mês
// corrente entra para completar a fatura em aberto do próprio mês. E limitar a N meses
// evita materializar uma compra de 24x inteira (2 anos de apostas) de uma vez —
// parcelas mais distantes entram naturalmente quando o banco as gerar.
const PROJECTION_HORIZON_MONTHS = 4;

/**
 * Termos que indicam PAGAMENTO/QUITAÇÃO de fatura na descrição da Pluggy.
 * Pagamento de fatura NÃO é uma transação da fatura — é a quitação dela, e o app
 * já tem fluxo próprio ("Marcar como paga"). Além disso é AMBÍGUO por Open Finance:
 * o mesmo "PAGAMENTO DE FATURA" pode quitar a fatura anterior OU adiantar a atual,
 * com o MESMO billId/nome — nem a Pluggy nem o banco distinguem (só o usuário sabe).
 * Trazê-lo como transação do cartão bagunçava o total. Por isso o sync o IGNORA.
 * Estornos (crédito SEM esses termos) continuam entrando — são ajustes de compra
 * daquela fatura e devem abater o total.
 * ⚠️ Casa por texto — cobre o padrão de vários bancos via MeuPluggy. Se outro
 * banco nomear o pagamento diferente, ampliar esta lista.
 * - "pagamento de fatura"/"pagamento cartao": Santander.
 * - "pagamento recebido": Mercado Pago (confirmado com dado real de prod — o MP
 *   nomeia TODO pagamento de fatura como "Pagamento recebido"; sem este termo o
 *   pagamento entrava como crédito e abatia a fatura indevidamente).
 */
const INVOICE_PAYMENT_TERMS = [
	"pagamento de fatura",
	"pagamento cartao",
	"pagamento recebido",
];

/** True se a descrição indica pagamento/quitação de fatura (não estorno). */
function isInvoicePayment(description: string): boolean {
	const normalized = description.toLowerCase();
	return INVOICE_PAYMENT_TERMS.some((term) => normalized.includes(term));
}

export interface SyncResult {
	status: "ok" | "throttled" | "skipped" | "error";
	/** total de transações vindas do Pluggy */
	fetched: number;
	/** Camada 1: inseridos novos e NÃO marcados como duplicata */
	inserted: number;
	/**
	 * Camada 2. Cartão: duplicatas REAIS suprimidas (mesma parcela reinserida —
	 * não são inseridas). Conta/Inbox: itens inseridos MARCADOS como possível
	 * duplicata (o Inbox marca em vez de suprimir, pois o usuário revisa antes).
	 */
	duplicateFlagged: number;
	/** Camada 1 pulou o insert porque o id externo já existia */
	alreadyExisted: number;
	/** motivo, presente em skipped/throttled/error */
	message?: string;
}

/** YYYY-MM-DD no fuso de negócio (America/Sao_Paulo). */
function toBusinessDay(date: Date): string {
	return getBusinessDateString(date);
}

/**
 * Dia (YYYY-MM-DD) do campo `date` de uma transação Pluggy, por UTC-slice.
 *
 * ⚠️ O `date` do Open Finance é conceitualmente o DIA CONTÁBIL da transação — o
 * mesmo que o banco põe na fatura — não um instante preciso. O horário costuma ser
 * ruído: a Pluggy usa PLACEHOLDER de madrugada (ex.: estorno com `01:01:01Z`)
 * quando não tem a hora real. Aplicar o fuso de SP (toBusinessDay) a esses
 * timestamps de madrugada empurra a transação para o dia ANTERIOR (bug real: um
 * estorno de 03/07 vinha `01:01:01Z` → SP 02/07 22h → exibido como 02/07, 1 dia
 * atrás da fatura do banco). O UTC-slice devolve o dia que o banco usa, batendo com
 * a fatura real — que é o ponto do Open Finance. Também remove a incoerência com
 * `purchaseDayKey`, que a dedup Camada 2 já usa (UTC-slice) para casar o mesmo dia.
 */
function pluggyTxDay(isoDate: string): string {
	return new Date(isoDate).toISOString().slice(0, 10);
}

/** |valor| em centavos inteiros — comparação de dinheiro sem float cru. */
function toCents(value: number): number {
	return Math.round(Math.abs(value) * 100);
}

/**
 * Dia (YYYY-MM-DD) de uma `purchaseDate` já persistida, por UTC-slice.
 * O sync de cartão grava a data de compra ao meio-dia UTC do dia local; e
 * transações de OFX/manual nascem à meia-noite local (= UTC no servidor Railway).
 * Nos dois casos o slice UTC devolve o dia pretendido — usar toBusinessDay aqui
 * deslocaria meia-noite UTC para o dia anterior em SP. Só para a Camada 2.
 */
function purchaseDayKey(date: Date): string {
	return date.toISOString().slice(0, 10);
}

/**
 * Mapa descrição-normalizada → categoryId do histórico de import do usuário.
 * Espelha `fetchCategoryMappings` (transactions/actions/category-memory-action),
 * mas recebe o `userId` explícito — o sync roda fora de um request HTTP, então
 * não pode usar a versão que resolve o userId via headers()/sessão.
 */
async function fetchCategoryMappingsForUser(
	userId: string,
	descriptions: string[],
): Promise<Record<string, string>> {
	const keys = descriptions.map(normalizeDescriptionKey).filter(Boolean);
	if (keys.length === 0) return {};

	const rows = await db
		.select({
			descriptionKey: importCategoryMappings.descriptionKey,
			categoryId: importCategoryMappings.categoryId,
		})
		.from(importCategoryMappings)
		.where(
			and(
				eq(importCategoryMappings.userId, userId),
				inArray(importCategoryMappings.descriptionKey, keys),
			),
		);

	return Object.fromEntries(rows.map((r) => [r.descriptionKey, r.categoryId]));
}

/** Chave de conteúdo da Camada 2: dia local | centavos | descrição. */
function contentKey(
	localDay: string,
	cents: number,
	description: string,
): string {
	return `${localDay}|${cents}|${description.trim()}`;
}

/**
 * Valor EFETIVO da transação em BRL, preservando o sinal do `amount`.
 *
 * ⚠️ COMPRA EM MOEDA ESTRANGEIRA: a Pluggy manda `amount` na moeda ORIGINAL
 * (ex.: 21.51 USD) e o valor já convertido em BRL em `amountInAccountCurrency`
 * (114.29). Confirmado com dado real (Nubank: Anthropic 21.51 USD → 114.29 BRL;
 * Railway 5 USD → 26.57 BRL). Sem converter, o sync gravava dólar como se fosse
 * real e subestimava a fatura. O IOF vem como transação SEPARADA (não somamos).
 * Usa o valor em BRL só quando a moeda não é BRL E a conversão existe; senão o
 * `amount` cru (compra em BRL, o comum). O SINAL vem sempre do `amount` (compra
 * vs pagamento) — `amountInAccountCurrency` entra como magnitude.
 *
 * Precisa ser reusado no prefetch de dedup (expenseKeys) E no loop, senão as
 * chaves de conteúdo ficam em moedas diferentes e a dedup de crédito-contrapartida
 * de compra estrangeira não casa.
 */
function effectiveAmountBRL(tx: {
	amount: number;
	currencyCode: string | null;
	amountInAccountCurrency: number | null;
}): number {
	const isForeign =
		tx.currencyCode != null &&
		tx.currencyCode !== "BRL" &&
		tx.amountInAccountCurrency != null;
	return isForeign
		? Math.sign(tx.amount) * Math.abs(tx.amountInAccountCurrency as number)
		: tx.amount;
}

/**
 * Chave de DUPLICATA REAL (mais estrita que contentKey): inclui o número da
 * parcela. Duas parcelas DIFERENTES de uma mesma compra (ex.: 12/21 e 13/21) têm
 * o mesmo dia|valor|descrição — a contentKey sozinha as trataria como duplicatas
 * e marcaria da 2ª em diante como "[possível duplicata]" (bug real: 21 parcelas
 * legítimas marcadas). Acrescentar parcela_atual/qtde_parcela distingue-as. Uma
 * duplicata VERDADEIRA (a mesma parcela reinserida por troca de id pending→posted)
 * casa aqui porque tem o MESMO número de parcela. Transação sem parcela usa "-".
 */
function installmentKey(
	localDay: string,
	cents: number,
	description: string,
	currentInstallment: number | null,
	installmentCount: number | null,
): string {
	const inst =
		currentInstallment != null && installmentCount != null
			? `${currentInstallment}/${installmentCount}`
			: "-";
	return `${contentKey(localDay, cents, description)}|${inst}`;
}

/**
 * Deriva o período (YYYY-MM) do `billForecastDate` de uma parcela.
 *
 * ⚠️ Para uma compra PARCELADA, a Pluggy entrega TODAS as parcelas de uma vez, mas
 * as futuras vêm PENDING e SEM `billId` (o bill só existe para faturas já fechadas).
 * O único sinal do vencimento de cada parcela é o `billForecastDate`, que avança 1
 * mês por parcela (confirmado com dado real do Mercado Pago: 1/21→2026-08, 2/21→
 * 2026-09, … 21/21→2028-04). Sem usá-lo, todas as parcelas caem no fallback
 * `deriveCreditCardPeriod(data-da-compra)` = MESMO período → a fatura amontoa
 * parcelas que deveriam estar em meses diferentes (bug real: 8/21,12/21,14/21… todas
 * juntas num mês). Por isso o billForecast entra na cadeia de roteamento ENTRE o
 * billId (fatura fechada) e a heurística.
 *
 * ⚠️ Só é confiável para PARCELA FUTURA (installmentNumber >= 2) — ver o roteamento
 * de período no loop. Para PENDING sem parcela (à vista/1ª parcela), o billForecast
 * do Santander vem como o mês da COMPRA (não o do vencimento) e engana; nesses casos
 * o roteamento usa a heurística deriveCreditCardPeriod, não esta função.
 *
 * Aceita "YYYY-MM" e "YYYY-MM-DD"; retorna null quando ausente/malformado. Retorna
 * o mês CRU do forecast (sem ajuste de fechamento→vencimento): para a parcela futura
 * do MP o forecast já é o mês de vencimento.
 */
function periodFromForecast(
	forecast: string | null | undefined,
): string | null {
	if (!forecast) return null;
	// Aceita "YYYY-MM" (formato observado) e "YYYY-MM-DD"; valida ano/mês.
	const match = /^(\d{4})-(\d{2})(?:-\d{2})?/.exec(forecast);
	if (!match) return null;
	const month = Number.parseInt(match[2], 10);
	if (month < 1 || month > 12) return null;
	return `${match[1]}-${match[2]}`;
}

/**
 * Consulta o estado REAL de um item na Pluggy (`GET /items/{id}`) e grava o
 * `status` cru + a expiração do consentimento na conexão local. É a lógica de
 * detecção de status do A2, extraída para ser reusável em DOIS gatilhos:
 *   - o `catch` de erro do sync (comportamento original — ver uso abaixo);
 *   - o webhook (`item/error`, `item/waiting_user_input`), que a antecipa em
 *     tempo real em vez de esperar o próximo sync falhar.
 *
 * Nunca lança: uma falha (Pluggy OU banco) é só logada sem credenciais e o
 * status fica como estava (não inventa LOGIN_ERROR). Recebe a conexão já
 * carregada (id + pluggyItemId) para não repetir o SELECT em cada caller.
 */
export async function refreshConnectionStatus(connection: {
	id: string;
	pluggyItemId: string;
}): Promise<void> {
	try {
		const item = await getItem(connection.pluggyItemId);
		const consentExpiresAt = item.consent?.expiresAt
			? new Date(item.consent.expiresAt)
			: undefined;
		await db
			.update(openFinanceConnections)
			.set({
				status: item.status,
				updatedAt: new Date(),
				// Só grava consentExpiresAt quando presente; senão não mexe.
				...(consentExpiresAt ? { consentExpiresAt } : {}),
			})
			.where(eq(openFinanceConnections.id, connection.id));
	} catch (statusError) {
		if (statusError instanceof PluggyApiError) {
			console.error("[refreshConnectionStatus] getItem status", {
				connectionId: connection.id,
				status: statusError.status,
				code: statusError.code,
				errorId: statusError.errorId,
				message: statusError.message,
			});
		} else {
			const sErr = statusError as Error;
			console.error("[refreshConnectionStatus] getItem status", {
				connectionId: connection.id,
				name: sErr.name,
				message: sErr.message,
			});
		}
		// Não propaga: o status fica como estava.
	}
}

/** Conexão já carregada (linha inteira de openFinanceConnections). */
type LoadedConnection = typeof openFinanceConnections.$inferSelect;

const CARD_PAYMENT_METHOD = "Cartão de crédito";

/**
 * Sincroniza UMA conexão vinculada a um CARTÃO local (Fase 2).
 *
 * Diferente do caminho de conta (que joga em `inboxItems` para o usuário revisar),
 * aqui a intenção já foi declarada no vínculo do cartão — as transações entram
 * DIRETO em `transactions`, no cartão, no período de fatura correto. Espelha o
 * insert do import de OFX (import-action.ts): paymentMethod="Cartão de crédito",
 * condition="À vista", isSettled=false, ofxFitId=tx.id.
 *
 * Roteamento de fatura: `deriveCreditCardPeriod(dataDaCompra, closingDay, dueDay)`
 * — a MESMA função do form de transação. A Pluggy entrega parcela-a-parcela no mês
 * certo, então cada uma cai sozinha na fatura correta (parcelamento tratado como
 * "À vista" — decisão da Fase 2A).
 *
 * Sinal do valor: usa o SINAL de `amount` (negativo = despesa), NÃO o `type` da
 * transação (o client documenta que `type` é não-confiável em cartão).
 *
 * Dedup em 2 camadas, igual ao caminho de conta, mas contra `transactions`:
 *   - Camada 1: `onConflictDoNothing` no uniqueIndex (userId, ofxFitId).
 *   - Camada 2: chave de conteúdo (dia|centavos|descrição) contra transações já
 *     existentes DO MESMO CARTÃO — insere assim mesmo com prefixo/nota
 *     "[possível duplicata]". NUNCA suprime, NUNCA deleta.
 */
/**
 * Lê o limite do cartão (creditData da account CREDIT vinculada) via
 * `listAccounts`. Best-effort: qualquer falha devolve nulls (o sync segue).
 * Retorna strings porque as colunas são `numeric` (o driver espera string|null).
 */
async function fetchCardCreditLimits(
	pluggyItemId: string,
	pluggyAccountId: string,
): Promise<{ available: string | null; total: string | null }> {
	try {
		const accounts = await listAccounts(pluggyItemId);
		const account = accounts.find((a) => a.id === pluggyAccountId);
		const cd = account?.creditData;
		const toStr = (v: number | null | undefined) =>
			typeof v === "number" && Number.isFinite(v) ? v.toFixed(2) : null;
		return {
			available: toStr(cd?.availableCreditLimit),
			total: toStr(cd?.creditLimit),
		};
	} catch (error) {
		console.warn("[syncCardConnection] falha ao ler limite do cartão", {
			pluggyItemId,
			name: (error as Error).name,
		});
		return { available: null, total: null };
	}
}

async function syncCardConnection(
	connection: LoadedConnection,
	options?: { force?: boolean },
): Promise<SyncResult> {
	const empty = {
		fetched: 0,
		inserted: 0,
		duplicateFlagged: 0,
		alreadyExisted: 0,
	};

	// Gate já garantiu pluggyAccountId + cardId. Reafirma para o narrowing.
	const cardId = connection.cardId;
	const pluggyAccountId = connection.pluggyAccountId;
	if (!cardId || !pluggyAccountId) {
		return {
			status: "skipped",
			...empty,
			message: "Vínculo de cartão incompleto.",
		};
	}

	// Throttle idêntico ao de conta (o webhook fura com force=true).
	const { lastSyncedAt } = connection;
	if (
		!options?.force &&
		lastSyncedAt &&
		Date.now() - lastSyncedAt.getTime() < THROTTLE_MS
	) {
		return { status: "throttled", ...empty, message: "Sincronizado há < 1h." };
	}

	// Carrega o cartão (ownership implícito: só chega aqui por vínculo do usuário).
	// closingDay/dueDay alimentam o roteamento de período.
	const [card] = await db
		.select({
			closingDay: cards.closingDay,
			dueDay: cards.dueDay,
		})
		.from(cards)
		.where(and(eq(cards.id, cardId), eq(cards.userId, connection.userId)));
	if (!card) {
		return {
			status: "skipped",
			...empty,
			message: "Cartão local não encontrado.",
		};
	}

	// ⚠️ CARTÃO: busca SEM filtro de data. Filtrar por data (`dateFrom`/`createdAtFrom`)
	// é conceitualmente errado para cartão PARCELADO: uma parcela futura (ex: 8/8) tem
	// `date` = data da COMPRA (que pode ser de meses atrás), então qualquer janela por
	// data-da-compra corta as parcelas futuras de compras antigas — e essas parcelas
	// pertencem justamente às faturas em aberto (set/out/…). Foi a causa real de MP e
	// Santander virem incompletos (parcelas de set+ de compras de abril sumiam com
	// dateFrom=90d). A Pluggy devolve TODAS as tx do cartão numa única página
	// (confirmado: MP=310, Nubank=447, Santander=86, todos next=null), então buscar
	// tudo é seguro e o roteamento por billId→período coloca cada parcela na fatura
	// certa. Proteções independem da janela: séries banidas (compra cancelada/fantasma)
	// e dedup (Camada 1 ofxFitId + Camada 2 conteúdo) rodam por transação, não por data.
	// Se algum cartão um dia passar de 1 página (next != null), aí sim implementar o
	// cursor — o warn abaixo sinaliza. Para CONTA, o filtro de data segue no outro caminho.
	let pluggyTransactions: PluggyTransaction[];
	let next: unknown;
	try {
		const page = await listTransactions(pluggyAccountId);
		pluggyTransactions = page.results;
		next = page.next;
	} catch (error) {
		if (error instanceof PluggyApiError) {
			console.error("[syncCardConnection] Pluggy error", {
				connectionId: connection.id,
				status: error.status,
				code: error.code,
				errorId: error.errorId,
				message: error.message,
			});
			await refreshConnectionStatus({
				id: connection.id,
				pluggyItemId: connection.pluggyItemId,
			});
			return {
				status: "error",
				...empty,
				message: `Pluggy respondeu HTTP ${error.status}.`,
			};
		}
		const err = error as Error;
		console.error("[syncCardConnection] network error", {
			connectionId: connection.id,
			name: err.name,
			message: err.message,
		});
		return {
			status: "error",
			...empty,
			message: "Falha de rede ao consultar a Pluggy.",
		};
	}

	if (next !== null) {
		console.warn(
			"[syncCardConnection] resultado paginado (next != null) — janela excedeu uma página; seguindo apenas com a primeira",
			{ connectionId: connection.id, count: pluggyTransactions.length },
		);
	}

	// Camada 2: prefetch das transações JÁ existentes deste cartão para montar as
	// chaves de conteúdo. Comparado contra qualquer transação do cartão (não só as
	// de origem openfinance) — registro manual/OFX prévio também deve ser detectado.
	// Também lê a ÂNCORA + isProjected + id, para a substituição projeção→real.
	const existing = await db
		.select({
			id: transactions.id,
			name: transactions.name,
			amount: transactions.amount,
			purchaseDate: transactions.purchaseDate,
			currentInstallment: transactions.currentInstallment,
			installmentCount: transactions.installmentCount,
			ofPurchaseAnchor: transactions.ofPurchaseAnchor,
			isProjected: transactions.isProjected,
		})
		.from(transactions)
		.where(
			and(
				eq(transactions.userId, connection.userId),
				eq(transactions.cardId, cardId),
			),
		);

	// Substituição projeção→real: mapa (âncora|parcela) → id da PROJEÇÃO existente.
	// Quando a parcela REAL chega no lote e casa uma projeção aqui, damos UPDATE na
	// projeção (vira real) em vez de INSERT — a projeção é NOSSA, é substituída, não
	// duplicada. Também rastreia âncora|parcela das reais JÁ existentes, para a fase
	// de projeção não recriar o que já existe.
	const projectedByAnchorInst = new Map<string, string>(); // anchor|inst -> projection id
	const realAnchorInst = new Set<string>(); // anchor|inst já existentes como REAL
	const anchorInstKey = (anchor: string, inst: number | null) =>
		`${anchor}|${inst ?? "-"}`;
	for (const row of existing) {
		if (!row.ofPurchaseAnchor) continue;
		const key = anchorInstKey(row.ofPurchaseAnchor, row.currentInstallment);
		if (row.isProjected) {
			projectedByAnchorInst.set(key, row.id);
		} else {
			realAnchorInst.add(key);
		}
	}

	// Duas estruturas de dedup, com propósitos e chaves DIFERENTES:
	//  • seenKeys (installmentKey, COM parcela): duplicata REAL — a mesma parcela
	//    reinserida (pending→posted trocou o id, Camada 1 não pegou). Inclui o número
	//    da parcela para NÃO confundir parcelas distintas (12/21 vs 13/21) da mesma
	//    compra, que têm dia|valor|descrição idênticos.
	//  • expenseKeys (contentKey, SEM parcela): compras conhecidas, para detectar o
	//    crédito-CONTRAPARTIDA. A Pluggy emite, no mesmo item, um par compra(−)+
	//    crédito(+) de mesmo |valor|/descrição/dia; o crédito é contábil, não estorno,
	//    e não deve abater a fatura. O crédito NÃO tem número de parcela, então casa a
	//    compra pela chave SEM parcela. Popular só com despesas evita pular estorno
	//    legítimo (que não tem compra-par de mesmo valor/descrição/dia).
	const seenKeys = new Set<string>();
	const expenseKeys = new Set<string>();
	for (const row of existing) {
		// `purchaseDate` é um `date` (sem hora) — o driver pg o traz à meia-noite
		// UTC. Extrair o dia por UTC-slice (NÃO por toBusinessDay, que converteria
		// para SP e voltaria um dia). Isso casa com o dia que gravamos abaixo, que
		// é derivado do MESMO UTC-slice da data da transação Pluggy.
		const localDay = purchaseDayKey(row.purchaseDate);
		const amountNum = Number.parseFloat(row.amount);
		const cents = toCents(amountNum);
		// Nome "limpo" (sem o prefixo de duplicata) para a chave casar o que vem cru
		// da Pluggy — a descrição da Pluggy nunca tem o prefixo.
		const cleanName = row.name.startsWith(DUPLICATE_PREFIX)
			? row.name.slice(DUPLICATE_PREFIX.length)
			: row.name;
		seenKeys.add(
			installmentKey(
				localDay,
				cents,
				cleanName,
				row.currentInstallment,
				row.installmentCount,
			),
		);
		// Despesa existente = amount negativo → é uma compra conhecida.
		if (amountNum < 0) {
			expenseKeys.add(contentKey(localDay, cents, cleanName));
		}
	}
	// Compras do LOTE atual da Pluggy (amount > 0 = compra na convenção de cartão) —
	// cobre o caso de compra e crédito chegarem no MESMO sync (o crédito pode vir
	// antes da compra no array; sem isto, dependeria da ordem).
	for (const tx of pluggyTransactions) {
		if (tx.amount > 0) {
			const localDay = pluggyTxDay(tx.date);
			// Mesmo valor efetivo em BRL do loop — senão a chave de compra estrangeira
			// ficaria em USD aqui e em BRL lá, e a dedup de contrapartida não casaria.
			const cents = toCents(effectiveAmountBRL(tx));
			const description = tx.description ?? MISSING_DESCRIPTION;
			expenseKeys.add(contentKey(localDay, cents, description));
		}
	}

	// Séries BANIDAS deste cartão: compras fantasma (canceladas no lojista). Dois
	// caminhos convivem na transição:
	//  • ignoredSeries (chave ANTIGA descrição/total/valor) — bans pré-âncora.
	//  • ignoredAnchors (chave NOVA por purchaseDate) — bans manuais pós-âncora +
	//    ban AUTOMÁTICO de cancelamento (abaixo). Imune à fragmentação.
	const ignoredSeries = await loadIgnoredSeriesKeys(connection.userId, cardId);
	const ignoredAnchors = await loadIgnoredSeriesAnchors(
		connection.userId,
		cardId,
	);

	// FASE DE ÂNCORA: agrupa o lote por série (purchaseDate + total) para (1) detectar
	// cancelamento e banir a série inteira automaticamente, e (2) alimentar a projeção
	// de parcelas futuras ausentes (mais abaixo). A âncora é imune à descrição truncada
	// e ao valor oscilante que fragmentavam a série na chave antiga.
	interface AnchorGroup {
		anchor: string; // purchaseDate cru (chave de ofPurchaseAnchor)
		total: number; // total de parcelas (>= 2)
		description: string; // descrição de amostra (para o registro de ban)
		canceled: boolean; // alguma parcela sinaliza cancelamento
		// |centavos| da parcela de MAIOR número vista (mais representativa das
		// futuras: a 1ª parcela às vezes é arredondada pra cima, ex. 16,02 vs 16,01 /
		// 93,75 vs 93,59 — confirmado com dado real). Diferença de 1 centavo é
		// autocorrigida quando a real substitui a projeção, mas usar a última reduz o
		// ruído. Só de COMPRA (amount>0).
		perInstallmentCents: number | null;
		valueFromInstallment: number | null; // nº da parcela de onde veio perInstallmentCents
		firstForecast: string | null; // billForecastDate da menor parcela vista (base do período)
		firstInstallment: number | null; // menor installmentNumber visto (base do forecast)
		categoryId: string | null; // categoria de amostra (p/ projeção)
	}
	const anchorGroups = new Map<string, AnchorGroup>();
	for (const tx of pluggyTransactions) {
		const anchor = seriesAnchorFromTransaction(cardId, tx);
		// Só séries parceladas (total >= 2) entram na consolidação/projeção.
		if (!anchor || anchor.totalInstallments == null) continue;
		const key = serializeAnchor(anchor);
		const meta = tx.creditCardMetadata;
		const inst = meta?.installmentNumber ?? null;
		const existingGroup = anchorGroups.get(key);
		if (!existingGroup) {
			anchorGroups.set(key, {
				anchor: anchor.purchaseAnchor,
				total: anchor.totalInstallments,
				description: tx.description ?? MISSING_DESCRIPTION,
				canceled: isCanceledInstallment(tx),
				perInstallmentCents:
					tx.amount > 0 ? toCents(effectiveAmountBRL(tx)) : null,
				valueFromInstallment: tx.amount > 0 ? inst : null,
				firstForecast: meta?.billForecastDate ?? null,
				firstInstallment: inst,
				categoryId: null, // preenchido após mappings existir (abaixo)
			});
		} else {
			existingGroup.canceled ||= isCanceledInstallment(tx);
			// Valor da parcela = a de MAIOR número vista (a 1ª às vezes é arredondada).
			if (
				tx.amount > 0 &&
				inst != null &&
				(existingGroup.valueFromInstallment == null ||
					inst > existingGroup.valueFromInstallment)
			) {
				existingGroup.perInstallmentCents = toCents(effectiveAmountBRL(tx));
				existingGroup.valueFromInstallment = inst;
			}
			// Mantém o forecast/número da MENOR parcela vista (base para projetar as demais).
			if (
				inst != null &&
				(existingGroup.firstInstallment == null ||
					inst < existingGroup.firstInstallment)
			) {
				existingGroup.firstInstallment = inst;
				existingGroup.firstForecast = meta?.billForecastDate ?? null;
			}
		}
	}

	// BAN AUTOMÁTICO de cancelamento: para cada série com parcela cancelada, bane pela
	// âncora e apaga as parcelas irmãs (reais + projeções) de uma vez. Sem clique do
	// usuário — a Pluggy sinaliza o cancelamento (ver isCanceledInstallment). Idempotente.
	let autoBannedCanceled = 0;
	for (const group of anchorGroups.values()) {
		if (!group.canceled) continue;
		if (ignoredAnchors.has(group.anchor)) continue; // já banida
		const removed = await banSeriesByAnchor(
			connection.userId,
			cardId,
			group.anchor,
			group.description,
		);
		ignoredAnchors.add(group.anchor);
		autoBannedCanceled += removed;
	}

	// Categorização: histórico exato (descrição → categoria). Sem match → null.
	// NÃO reusar fetchCategoryMappings (transactions/actions): ela resolve o userId
	// via getUserId()→headers(), que só existe dentro de um request HTTP — o sync
	// roda fora disso (webhook/runner). Query direta com o userId da conexão.
	const mappings = await fetchCategoryMappingsForUser(
		connection.userId,
		pluggyTransactions.map((tx) => tx.description ?? MISSING_DESCRIPTION),
	);
	const payerId = await getAdminPayerId(connection.userId);

	// Preenche a categoria de amostra de cada grupo de âncora (usa a categoria da 1ª
	// parcela conhecida da série) — a projeção herda a mesma categoria das reais.
	for (const tx of pluggyTransactions) {
		const anchor = seriesAnchorFromTransaction(cardId, tx);
		if (!anchor || anchor.totalInstallments == null) continue;
		const group = anchorGroups.get(serializeAnchor(anchor));
		if (group && group.categoryId == null) {
			const description = tx.description ?? MISSING_DESCRIPTION;
			group.categoryId = mappings[normalizeDescriptionKey(description)] ?? null;
		}
	}

	// Roteamento de período pelo BANCO (fonte de verdade), não pela heurística.
	// Cada transação traz creditCardMetadata.billId; o bill (GET /bills/{id}) tem
	// o dueDate (vencimento), cujo mês É o período da fatura. A heurística
	// deriveCreditCardPeriod erra quando o fechamento real varia mês a mês
	// (confirmado com dados reais: fechamento oscilava 29–31). Buscamos cada
	// billId DISTINTO uma vez (cache no lote — evita N chamadas repetidas para
	// transações da mesma fatura). Uma falha em /bills não derruba o sync: a
	// transação cai no fallback da heurística (ver o cálculo de `period` no loop).
	const billPeriodCache = new Map<string, string>();
	const distinctBillIds = [
		...new Set(
			pluggyTransactions
				.map((tx) => tx.creditCardMetadata?.billId)
				.filter((id): id is string => Boolean(id)),
		),
	];
	for (const billId of distinctBillIds) {
		try {
			const bill = await getBill(billId);
			if (bill.dueDate) {
				billPeriodCache.set(
					billId,
					derivePeriodFromDate(bill.dueDate.slice(0, 10)),
				);
			}
		} catch (billError) {
			// Best-effort: sem o bill, a transação usa o fallback da heurística.
			// Loga sem PII (só o status/nome do erro) e segue.
			if (billError instanceof PluggyApiError) {
				console.warn("[syncCardConnection] getBill falhou", {
					connectionId: connection.id,
					status: billError.status,
				});
			} else {
				console.warn("[syncCardConnection] getBill erro de rede", {
					connectionId: connection.id,
					name: (billError as Error).name,
				});
			}
		}
	}

	const importBatchId = crypto.randomUUID();
	let inserted = 0;
	let duplicateFlagged = 0; // duplicatas REAIS suprimidas (mesma parcela reinserida)
	let alreadyExisted = 0;
	let skippedPayments = 0; // pagamentos de fatura ignorados (não são compra/estorno)
	let skippedCreditDuplicates = 0; // créditos-contrapartida de compra (não abatem)
	let skippedIgnoredSeries = 0; // séries banidas pelo usuário (compra fantasma)

	for (const tx of pluggyTransactions) {
		const description = tx.description ?? MISSING_DESCRIPTION;
		// Dia contábil do `date` da Pluggy por UTC-slice (ver pluggyTxDay): o mesmo
		// dia que o banco põe na fatura, sem o deslocamento de fuso que placeholders
		// de madrugada causavam. Usado como data de compra E base do período.
		const localDay = pluggyTxDay(tx.date);
		const purchaseDate = new Date(`${localDay}T12:00:00.000Z`);
		// Roteamento de período, em ordem de prioridade:
		//  1. billId → dueDate do bill (fatura já FECHADA: fonte de verdade do
		//     fechamento real do banco; POSTED).
		//  2. billForecastDate SÓ para PARCELA FUTURA (installmentNumber >= 2): a
		//     Pluggy entrega todas as parcelas de uma vez com a MESMA data de compra,
		//     então a heurística (que usa a data) jogaria todas no mesmo mês. O
		//     billForecast avança 1 mês por parcela e é a ÚNICA forma de espalhá-las
		//     (confirmado no MP: 2/21→2026-09 … 21/21→2028-04). Usado CRU — para
		//     essas parcelas o forecast já é o mês de vencimento.
		//  3. heurística deriveCreditCardPeriod(dataDaCompra, fecha, vence) para todo
		//     o resto (à vista, parcela 1/N, sem billId). ⚠️ Ela é SUPERIOR ao
		//     billForecast aqui porque usa o DIA da compra vs o fechamento — o
		//     billForecast de PENDING sem parcela (ex.: Santander) vem como o mês da
		//     COMPRA, não o do vencimento, e enganava o roteamento (compra 31/07 pós-
		//     fechamento caía em ago em vez de set). A heurística acerta esses casos.
		const billId = tx.creditCardMetadata?.billId;
		const forecastInstallment =
			tx.creditCardMetadata?.installmentNumber ?? null;
		const isFutureInstallment =
			forecastInstallment !== null && forecastInstallment >= 2;
		const period =
			(billId && billPeriodCache.get(billId)) ||
			(isFutureInstallment
				? periodFromForecast(tx.creditCardMetadata?.billForecastDate)
				: null) ||
			deriveCreditCardPeriod(localDay, card.closingDay, card.dueDay);

		// Valor efetivo em BRL (converte compra em moeda estrangeira; ver helper).
		const effectiveAmount = effectiveAmountBRL(tx);
		const cents = toCents(effectiveAmount);

		// ⚠️ Convenção de sinal do CARTÃO de crédito na Pluggy é o OPOSTO da conta:
		// amount POSITIVO = compra (despesa/dívida), NEGATIVO = pagamento/estorno
		// (crédito que abate a fatura). Confirmado com dados reais (banco Santander
		// via MeuPluggy): compra vinha "+", pagamento "−". NÃO usar tx.type
		// (não-confiável em cartão). Alinhamos à convenção do SISTEMA — igual ao
		// import de OFX (import-action.ts): Despesa → amount NEGATIVO; Receita →
		// amount POSITIVO. Derivamos o tipo e aplicamos o sinal coerente (não
		// gravamos o sinal cru da Pluggy, que invertia tudo). O sinal vem do `amount`
		// original (mesmo em compra estrangeira — amountInAccountCurrency é magnitude).
		const isExpense = effectiveAmount > 0;

		// PAGAMENTO DE FATURA não é transação da fatura — é a quitação dela, e é
		// ambíguo por Open Finance (pode quitar a anterior ou adiantar a atual, com
		// o mesmo billId). O app trata quitação/adiantamento pelo fluxo próprio.
		// Pulamos: só créditos (não-despesa) cujo nome indica pagamento. Estornos
		// (crédito sem esses termos) seguem entrando e abatem o total normalmente.
		if (!isExpense && isInvoicePayment(description)) {
			skippedPayments += 1;
			continue;
		}

		// ⚠️ CRÉDITO-CONTRAPARTIDA de uma compra conhecida → PULA (não abate).
		// A Pluggy emite, para o MESMO item (parcelamento, pending→posted,
		// reprocessamento), um par débito+crédito de mesmo valor/descrição/dia: a
		// compra (amount>0) E um crédito (amount<0) que é só a contrapartida contábil,
		// NÃO um estorno real. O crédito casa uma COMPRA em expenseKeys (chave SEM
		// parcela — o crédito não traz número de parcela) e é pulado. Um ESTORNO REAL
		// não tem compra-par de mesmo valor/descrição/dia → não está em expenseKeys →
		// segue entrando e abatendo. Independe de ordem (expenseKeys já inclui as
		// compras do próprio lote). Ver o prefetch acima.
		if (
			!isExpense &&
			expenseKeys.has(contentKey(localDay, cents, description))
		) {
			skippedCreditDuplicates += 1;
			continue;
		}

		const transactionType = isExpense ? "Despesa" : "Receita";
		const signedAmount = isExpense
			? -Math.abs(effectiveAmount)
			: Math.abs(effectiveAmount);
		const categoryId = mappings[normalizeDescriptionKey(description)] ?? null;

		// Parcelamento: a Pluggy entrega parcela-a-parcela no mês certo (o `amount`
		// já é o valor DA PARCELA, não o total), mas informa qual parcela é via
		// creditCardMetadata. Só rotulamos "Parcelado" com total >= 2 (igual ao
		// form manual, que exige >= 2); parcela única segue "À vista". É só rótulo
		// (condition + parcela_atual/qtde_parcela) — NÃO muda valor nem período.
		const meta = tx.creditCardMetadata;
		const totalInstallments = meta?.totalInstallments ?? null;
		const installmentNumber = meta?.installmentNumber ?? null;
		const isInstallment =
			isExpense && totalInstallments !== null && totalInstallments >= 2;

		// Âncora de série desta transação (purchaseDate cru). Null quando falta o
		// metadado — cai no caminho antigo por transação (sem consolidar/projetar).
		const txAnchor = seriesAnchorFromTransaction(cardId, tx);
		const purchaseAnchor = txAnchor?.purchaseAnchor ?? null;

		// SÉRIE BANIDA por ÂNCORA (chave nova): ban manual pós-âncora + ban automático
		// de cancelamento. Imune à fragmentação. Pula sem inserir.
		if (purchaseAnchor && ignoredAnchors.has(purchaseAnchor)) {
			skippedIgnoredSeries += 1;
			continue;
		}

		// SÉRIE BANIDA pela chave ANTIGA (transição): bans pré-âncora. A chave usa
		// descrição + total (null se à vista) + |centavos| SEMPRE (a descrição truncada
		// pela Pluggy não desambigua séries — ver comentário em ignored-series.ts).
		const seriesKey = serializeSeriesKey({
			cardId,
			description,
			installmentCount: isInstallment ? totalInstallments : null,
			amountKey: cents,
		});
		if (ignoredSeries.has(seriesKey)) {
			skippedIgnoredSeries += 1;
			continue;
		}

		// DUPLICATA REAL: a MESMA transação (incl. o número da parcela) já existe.
		// Acontece quando pending→posted troca o id externo (a Camada 1 por ofxFitId
		// não pega) e o conteúdo reaparece. A chave inclui a parcela para NÃO tratar
		// parcelas distintas (12/21 vs 13/21, mesmo dia/valor/descrição) como cópias.
		// Decisão: SUPRIME (não insere) — cartão parcelado gera muitos falsos e o
		// "[possível duplicata]" poluía a lista e inflava a fatura. Risco aceito: duas
		// compras REAIS idênticas (mesmo dia/valor/descrição/parcela) — raríssimo em
		// cartão — a 2ª seria perdida.
		// Usa os MESMOS valores de parcela que serão gravados (condicionados por
		// isInstallment: à vista ou total<2 → null), para a chave casar o que o
		// prefetch lê do banco. Sem isto, uma compra à vista que a Pluggy manda como
		// "1/1" geraria chave "1/1" no loop mas "-" no prefetch (banco grava null) —
		// e a duplicata escaparia.
		const dupKey = installmentKey(
			localDay,
			cents,
			description,
			isInstallment ? installmentNumber : null,
			isInstallment ? totalInstallments : null,
		);
		if (seenKeys.has(dupKey)) {
			duplicateFlagged += 1;
			continue;
		}

		// SUBSTITUIÇÃO projeção→real: se esta parcela REAL casa uma PROJEÇÃO existente
		// (mesma âncora + número de parcela), damos UPDATE na projeção em vez de INSERT.
		// A projeção é NOSSA aposta — é substituída pela real, não duplicada. Esta é a
		// única exceção deliberada ao "nunca deleta/altera" do sync, restrita a
		// isProjected=true. Carimba ofxFitId (vira dedup Camada 1 daqui pra frente),
		// zera isProjected, e grava valor/período/categoria reais.
		const substitutionKey = purchaseAnchor
			? anchorInstKey(purchaseAnchor, isInstallment ? installmentNumber : null)
			: null;
		const projectionId = substitutionKey
			? projectedByAnchorInst.get(substitutionKey)
			: undefined;
		if (projectionId) {
			await db
				.update(transactions)
				.set({
					name: description,
					condition: isInstallment ? "Parcelado" : "À vista",
					installmentCount: isInstallment ? totalInstallments : null,
					currentInstallment: isInstallment ? installmentNumber : null,
					amount: signedAmount.toFixed(2),
					purchaseDate,
					transactionType,
					period,
					categoryId,
					ofxFitId: tx.id,
					isProjected: false, // deixou de ser aposta — é a parcela real
				})
				.where(
					and(
						eq(transactions.id, projectionId),
						eq(transactions.userId, connection.userId),
						eq(transactions.isProjected, true), // trava: só substitui projeção
					),
				);
			projectedByAnchorInst.delete(substitutionKey as string);
			if (substitutionKey) realAnchorInst.add(substitutionKey);
			seenKeys.add(dupKey);
			if (isExpense) expenseKeys.add(contentKey(localDay, cents, description));
			inserted += 1; // conta como materializada
			continue;
		}

		const [row] = await db
			.insert(transactions)
			.values({
				name: description,
				condition: isInstallment ? "Parcelado" : "À vista",
				installmentCount: isInstallment ? totalInstallments : null,
				currentInstallment: isInstallment ? installmentNumber : null,
				paymentMethod: CARD_PAYMENT_METHOD,
				amount: signedAmount.toFixed(2), // sinal alinhado à convenção do sistema
				purchaseDate,
				transactionType,
				period,
				isSettled: false, // fatura de cartão ainda não paga
				userId: connection.userId,
				cardId,
				categoryId,
				payerId,
				ofxFitId: tx.id, // Camada 1: dedup por id externo
				ofPurchaseAnchor: purchaseAnchor, // âncora de série (consolidação/projeção)
				importBatchId,
			})
			.onConflictDoNothing({
				target: [transactions.userId, transactions.ofxFitId],
				where: sql`${transactions.ofxFitId} is not null`,
			})
			.returning({ id: transactions.id });

		if (!row) {
			alreadyExisted += 1;
			// ⚠️ A parcela real JÁ existe (Camada 1 por ofxFitId pegou). Ainda assim
			// precisa entrar em realAnchorInst — senão a FASE DE PROJEÇÃO não sabe que
			// essa parcela existe e cria uma PREVISTA duplicando-a. Crítico para cartão
			// SEM cleanup (ex.: Nubank), onde a maioria das reais cai aqui em vez de
			// passar pelo insert. Sem isto, todo sync incremental duplicaria as reais
			// existentes como previstas.
			if (substitutionKey) realAnchorInst.add(substitutionKey);
			continue;
		}
		inserted += 1;
		// Marca a chave (com parcela) para que uma cópia idêntica MAIS ADIANTE no
		// mesmo lote também seja suprimida. Marca também a compra em expenseKeys para
		// um crédito-contrapartida que venha depois no lote ser pulado.
		seenKeys.add(dupKey);
		if (substitutionKey) realAnchorInst.add(substitutionKey);
		if (isExpense) {
			expenseKeys.add(contentKey(localDay, cents, description));
		}
	}

	// FASE DE PROJEÇÃO: para cada série parcelada NÃO cancelada, projeta as parcelas
	// FUTURAS ausentes (o emissor gera parcela-a-parcela; a fatura ficaria incompleta
	// até ele gerar cada uma). A projeção deixa a fatura completa já; a parcela real
	// substitui a projeção quando chega (bloco de substituição acima).
	//
	// ⚠️ Travas (ver PROJECTION_HORIZON_MONTHS): só projeta parcela cujo período seja
	// (a) >= mês atual (nunca RETROATIVO — projetar passado reintroduziria parcela em
	// fatura já paga, bug que os dados do Nubank expuseram; o mês CORRENTE entra para
	// completar a fatura em aberto do próprio mês, ex.: a 3/3 de agosto que o emissor
	// ainda não gerou) e (b) dentro do horizonte. As séries incompletas do Nubank que
	// motivaram a trava são todas de meses PASSADOS (2024/2025), então `< atual` segue
	// bloqueado e elas não são reprojetadas. Base do período de cada parcela k: o
	// forecast da 1ª parcela vista + (k - inst0) meses. Sem forecast → não projeta.
	const currentPeriod = getCurrentPeriod();
	const horizonPeriod = addMonthsToPeriod(
		currentPeriod,
		PROJECTION_HORIZON_MONTHS,
	);
	let projectedCount = 0;
	for (const group of anchorGroups.values()) {
		if (group.canceled) continue; // série cancelada nunca projeta
		if (ignoredAnchors.has(group.anchor)) continue; // banida (manual/auto)
		if (group.perInstallmentCents == null) continue; // sem valor de parcela conhecido
		if (group.firstForecast == null || group.firstInstallment == null) continue;
		const baseForecast = periodFromForecast(group.firstForecast);
		if (!baseForecast) continue;

		for (let k = 1; k <= group.total; k += 1) {
			const instKey = anchorInstKey(group.anchor, k);
			// Já existe (real materializada OU projeção viva) → não recria.
			if (realAnchorInst.has(instKey)) continue;
			if (projectedByAnchorInst.has(instKey)) continue;
			// Período desta parcela = forecast da 1ª parcela vista + deslocamento.
			const parcelaPeriod = addMonthsToPeriod(
				baseForecast,
				k - group.firstInstallment,
			);
			// Trava (a): mês atual ou futuro (nunca retroativo). (b): dentro do horizonte.
			if (comparePeriods(parcelaPeriod, currentPeriod) < 0) continue;
			if (comparePeriods(parcelaPeriod, horizonPeriod) > 0) continue;

			// purchaseDate exibido = dia da compra (âncora) ao meio-dia UTC.
			const anchorDay = group.anchor.slice(0, 10);
			const projectedPurchaseDate = new Date(`${anchorDay}T12:00:00.000Z`);
			const projectedAmount = -(group.perInstallmentCents / 100); // despesa (negativo)

			await db.insert(transactions).values({
				name: group.description,
				condition: "Parcelado",
				installmentCount: group.total,
				currentInstallment: k,
				paymentMethod: CARD_PAYMENT_METHOD,
				amount: projectedAmount.toFixed(2),
				purchaseDate: projectedPurchaseDate,
				transactionType: "Despesa",
				period: parcelaPeriod,
				isSettled: false,
				userId: connection.userId,
				cardId,
				categoryId: group.categoryId,
				payerId,
				ofxFitId: null, // projeção NÃO veio da Pluggy
				ofPurchaseAnchor: group.anchor,
				isProjected: true, // aposta — substituída pela real quando chegar
				importBatchId,
			});
			projectedByAnchorInst.set(instKey, "pending"); // evita recriar no mesmo lote
			projectedCount += 1;
		}
	}

	// LIMPEZA de projeção órfã: projeções cuja parcela real JÁ existe (materializada
	// fora do fluxo de substituição, ex.: import manual) ou cuja série foi banida
	// devem sair — nunca deixar projeção duplicando uma real. A substituição no loop
	// já cobre o caso comum; esta varredura cobre o resíduo. Só toca isProjected=true.
	const orphanProjectionIds: string[] = [];
	for (const [key, id] of projectedByAnchorInst.entries()) {
		if (id === "pending") continue; // recém-criada neste lote
		if (realAnchorInst.has(key)) orphanProjectionIds.push(id);
		else {
			const anchorPart = key.slice(0, key.lastIndexOf("|"));
			if (ignoredAnchors.has(anchorPart)) orphanProjectionIds.push(id);
		}
	}
	if (orphanProjectionIds.length > 0) {
		await db
			.delete(transactions)
			.where(
				and(
					eq(transactions.userId, connection.userId),
					eq(transactions.cardId, cardId),
					eq(transactions.isProjected, true),
					inArray(transactions.id, orphanProjectionIds),
				),
			);
	}

	// Limite do banco (creditData da account CREDIT) — fonte de verdade do
	// "disponível" do cartão. Isolado em try/catch: uma falha aqui NÃO pode
	// derrubar o sync de transações (best-effort; grava null e segue).
	const creditLimits = await fetchCardCreditLimits(
		connection.pluggyItemId,
		pluggyAccountId,
	);

	// Sucesso → carimba lastSyncedAt e limpa status (mesma semântica do de conta).
	const now = new Date();
	await db
		.update(openFinanceConnections)
		.set({
			lastSyncedAt: now,
			updatedAt: now,
			status: "UPDATED",
			pluggyAvailableCreditLimit: creditLimits.available,
			pluggyCreditLimit: creditLimits.total,
		})
		.where(eq(openFinanceConnections.id, connection.id));

	if (
		skippedPayments > 0 ||
		skippedCreditDuplicates > 0 ||
		duplicateFlagged > 0 ||
		skippedIgnoredSeries > 0 ||
		autoBannedCanceled > 0 ||
		projectedCount > 0
	) {
		console.info("[syncCardConnection] lançamentos ignorados/projetados", {
			connectionId: connection.id,
			skippedPayments, // pagamentos de fatura (nome casa INVOICE_PAYMENT_TERMS)
			skippedCreditDuplicates, // crédito-contrapartida de compra (não abate)
			duplicateSuppressed: duplicateFlagged, // duplicata real (mesma parcela)
			skippedIgnoredSeries, // série banida (compra fantasma)
			autoBannedCanceled, // parcelas apagadas por ban automático de cancelamento
			projected: projectedCount, // parcelas futuras projetadas neste sync
		});
	}

	return {
		status: "ok",
		fetched: pluggyTransactions.length,
		inserted,
		duplicateFlagged,
		alreadyExisted,
	};
}

export async function syncOpenFinanceConnection(
	connectionId: string,
	options?: { force?: boolean },
): Promise<SyncResult> {
	const empty = {
		fetched: 0,
		inserted: 0,
		duplicateFlagged: 0,
		alreadyExisted: 0,
	};

	// 1. Carrega a conexão. Sem conexão ou sem vínculo → no-op descritivo.
	const [connection] = await db
		.select()
		.from(openFinanceConnections)
		.where(eq(openFinanceConnections.id, connectionId));

	if (!connection) {
		return { status: "skipped", ...empty, message: "Conexão não encontrada." };
	}
	// Sem account Pluggy escolhida → nada a sincronizar em nenhum dos caminhos.
	if (!connection.pluggyAccountId) {
		return {
			status: "skipped",
			...empty,
			message: "Conexão sem conta Pluggy vinculada.",
		};
	}
	// Ramificação por tipo de vínculo. Uma conexão aponta para um CARTÃO ou uma
	// CONTA (o vínculo limpa o outro lado — ver linkConnectionCardAction). O
	// caminho de cartão é uma função própria (transações direto no cartão, sem
	// Inbox); o caminho de conta (Inbox) segue INTOCADO abaixo — a separação
	// preserva por construção a invariante "conta continua indo pro Inbox".
	if (connection.cardId) {
		return syncCardConnection(connection, options);
	}
	if (!connection.accountId) {
		return {
			status: "skipped",
			...empty,
			message: "Conexão sem conta local vinculada.",
		};
	}

	// 2. Throttle: sincronizado há menos de 1h → no-op imediato. O webhook de
	//    transação (transactions/created) passa force=true: é um evento REAL da
	//    Pluggy, não polling — puxar na hora vale mais que respeitar o 1h, e o
	//    dedup em 2 camadas protege contra duplicata de qualquer forma.
	const { lastSyncedAt } = connection;
	if (
		!options?.force &&
		lastSyncedAt &&
		Date.now() - lastSyncedAt.getTime() < THROTTLE_MS
	) {
		return { status: "throttled", ...empty, message: "Sincronizado há < 1h." };
	}

	// 3. Janela de busca por DATA DA COMPRA (`dateFrom`). Primeiro sync = backfill
	//    90d; seguintes re-varrem os últimos INCREMENTAL_WINDOW_DAYS (ver comentário
	//    das constantes — `createdAtFrom` congelava o incremental).
	const windowDays = lastSyncedAt ? INCREMENTAL_WINDOW_DAYS : BACKFILL_DAYS;
	const fromDate = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
	const dateFrom = toBusinessDay(fromDate);

	// 4. Busca só a account vinculada (o pluggyAccountId já é a conta-corrente).
	let transactions: PluggyTransaction[];
	let next: unknown;
	try {
		const page = await listTransactions(connection.pluggyAccountId, {
			dateFrom,
		});
		transactions = page.results;
		next = page.next;
	} catch (error) {
		// Dentro deste try só existe a chamada à Pluggy. Todo erro aqui vira
		// no-op logado — inclusive falha de REDE do fetch (TypeError: DNS/timeout),
		// que senão propagaria cru e, na Entrega 2, derrubaria o load do dashboard.
		// (Erros de DB ficam FORA deste try e continuam propagando.)
		if (error instanceof PluggyApiError) {
			// Sem credencial no log — PluggyApiError só carrega status/code/errorId.
			console.error("[syncOpenFinanceConnection] Pluggy error", {
				connectionId,
				status: error.status,
				code: error.code,
				errorId: error.errorId,
				message: error.message,
			});
			// A2: o sync falhou — consulta o estado REAL do item (GET /items/{id})
			// e grava o status cru + expiração do consentimento na conexão, para o
			// badge refletir login expirado etc. Extraído para refreshConnectionStatus
			// (reusado pelo webhook); ele já engole toda falha sem propagar.
			await refreshConnectionStatus({
				id: connection.id,
				pluggyItemId: connection.pluggyItemId,
			});
			return {
				status: "error",
				...empty,
				message: `Pluggy respondeu HTTP ${error.status}.`,
			};
		}
		// Erro não-Pluggy realista aqui = falha de rede. Nunca dump do objeto
		// inteiro (pode carregar detalhe sensível) — só name/message.
		const err = error as Error;
		console.error("[syncOpenFinanceConnection] network error", {
			connectionId,
			name: err.name,
			message: err.message,
		});
		return {
			status: "error",
			...empty,
			message: "Falha de rede ao consultar a Pluggy.",
		};
	}

	// Janela estourou uma página: seguimos só com o que veio (não paginamos).
	if (next !== null) {
		console.warn(
			"[syncOpenFinanceConnection] resultado paginado (next != null) — janela excedeu uma página; seguindo apenas com a primeira",
			{ connectionId, count: transactions.length },
		);
	}

	// 6. Prefetch dos itens openfinance do usuário para a Camada 2 (chaves de
	//    conteúdo). Comparado contra QUALQUER status (um item já processado virou
	//    transação real — é o que não queremos duplicar).
	const existing = await db
		.select({
			parsedName: inboxItems.parsedName,
			parsedAmount: inboxItems.parsedAmount,
			notificationTimestamp: inboxItems.notificationTimestamp,
		})
		.from(inboxItems)
		.where(
			and(
				eq(inboxItems.userId, connection.userId),
				eq(inboxItems.sourceApp, SOURCE_APP),
			),
		);

	const seenKeys = new Set<string>();
	for (const row of existing) {
		if (row.parsedAmount === null) continue;
		// Slice UTC é seguro AQUI porque só lemos itens sourceApp="openfinance",
		// que este próprio sync grava ao meio-dia UTC do dia local
		// (localDay + "T12:00:00Z") — o slice devolve o localDay exato. Se o
		// filtro um dia ampliar para outras fontes, essa premissa quebra.
		const localDay = row.notificationTimestamp.toISOString().slice(0, 10);
		const cents = toCents(Number.parseFloat(row.parsedAmount));
		seenKeys.add(
			contentKey(localDay, cents, row.parsedName ?? MISSING_DESCRIPTION),
		);
	}

	// 5/7. Inserção transação a transação.
	let inserted = 0;
	let duplicateFlagged = 0;
	let alreadyExisted = 0;

	for (const tx of transactions) {
		const description = tx.description ?? MISSING_DESCRIPTION;
		// date vem ISO UTC; a Inbox deriva o dia via UTC-slice, então gravamos o
		// dia LOCAL (SP) ao meio-dia UTC para o dia exibido bater com o local.
		const localDay = toBusinessDay(new Date(tx.date));
		const notificationTimestamp = new Date(`${localDay}T12:00:00.000Z`);
		const cents = toCents(tx.amount);
		const key = contentKey(localDay, cents, description);
		const isDuplicate = seenKeys.has(key);

		const [row] = await db
			.insert(inboxItems)
			.values({
				userId: connection.userId,
				connectionId: connection.id, // F1.4: vínculo persistente inbox↔conexão
				sourceApp: SOURCE_APP, // sempre "openfinance" — identidade, não estado
				sourceAppName: connection.connectorName,
				originalTitle: isDuplicate
					? DUPLICATE_PREFIX + description
					: description,
				originalText: description, // notNull
				notificationTimestamp,
				parsedName: description,
				parsedAmount: tx.amount.toFixed(2), // COM sinal (negativo = despesa)
				status: "pending",
				externalSourceId: tx.id, // Camada 1
				possibleDuplicate: isDuplicate, // Camada 2 (fonte de verdade)
			})
			.onConflictDoNothing({
				target: [inboxItems.userId, inboxItems.externalSourceId],
				// O índice único é PARCIAL (WHERE external_source_id IS NOT NULL);
				// sem repetir o predicado o Postgres não infere o árbitro → 42P10.
				where: sql`${inboxItems.externalSourceId} is not null`,
			})
			.returning({ id: inboxItems.id });

		if (!row) {
			// Camada 1 pegou: id externo já existia.
			alreadyExisted += 1;
			continue;
		}

		if (isDuplicate) {
			duplicateFlagged += 1;
		} else {
			inserted += 1;
		}
		// Marca a chave para que uma 2ª idêntica no MESMO lote também seja flagada.
		seenKeys.add(key);
	}

	// 8. Sucesso → carimba lastSyncedAt (só aqui; nunca no caminho de erro).
	//    status="UPDATED": o sync voltou a funcionar, então o item está são —
	//    limpa qualquer LOGIN_ERROR anterior gravado no caminho de erro (A2).
	const now = new Date();
	await db
		.update(openFinanceConnections)
		.set({ lastSyncedAt: now, updatedAt: now, status: "UPDATED" })
		.where(eq(openFinanceConnections.id, connection.id));

	return {
		status: "ok",
		fetched: transactions.length,
		inserted,
		duplicateFlagged,
		alreadyExisted,
	};
}

/**
 * Sincroniza TODAS as conexões Open Finance de um usuário. Ponto de entrada do
 * gancho oportunístico no load do /dashboard (Entrega 2).
 *
 * Atrás da flag server-side `OPENFINANCE_ENABLED` (default DESLIGADO — ausência
 * da var = desligado). Cada conexão passa por `syncOpenFinanceConnection`, que
 * já é no-op em throttle/erro e nunca lança; um bug de programação (exceção
 * inesperada) propaga de propósito, para cair no try/catch do caller.
 */
export async function ensureOpenFinanceSynced(userId: string): Promise<void> {
	// Idioma do precedente `isSignupDisabled` — "True"/"true " não desligam por acidente.
	if (process.env.OPENFINANCE_ENABLED?.trim().toLowerCase() !== "true") return;

	const connections = await db
		.select({ id: openFinanceConnections.id })
		.from(openFinanceConnections)
		.where(eq(openFinanceConnections.userId, userId));

	// F1 tem 1 conexão, mas iteramos sobre todas (custo igual, futuro-prova).
	// Agrega os status para uma linha de diagnóstico SEM PII (só contagens) —
	// permite ver "4 skipped" virar "4 ok" após o backfill sem abrir o banco.
	const tally = { ok: 0, throttled: 0, skipped: 0, error: 0 };
	for (const { id } of connections) {
		const result = await syncOpenFinanceConnection(id);
		tally[result.status] += 1;
	}
	if (connections.length > 0) {
		console.info("[ensureOpenFinanceSynced]", {
			userId,
			connections: connections.length,
			...tally,
		});
	}
}
