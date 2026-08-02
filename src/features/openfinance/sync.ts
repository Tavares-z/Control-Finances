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
	getBill,
	getItem,
	listTransactions,
	PluggyApiError,
	type PluggyTransaction,
} from "@/features/openfinance/lib/pluggy-client";
import { deriveCreditCardPeriod } from "@/features/transactions/lib/form-helpers";
import { normalizeDescriptionKey } from "@/features/transactions/lib/import-utils";
import { db } from "@/shared/lib/db";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { getBusinessDateString } from "@/shared/utils/date";
import { derivePeriodFromDate } from "@/shared/utils/period";

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
const OVERLAP_HOURS = 24; // folga generosa nos syncs seguintes (dedup absorve)
const DUPLICATE_PREFIX = "[possível duplicata] ";
const MISSING_DESCRIPTION = "(sem descrição)";

export interface SyncResult {
	status: "ok" | "throttled" | "skipped" | "error";
	/** total de transações vindas do Pluggy */
	fetched: number;
	/** Camada 1: inseridos novos e NÃO marcados como duplicata */
	inserted: number;
	/** inseridos MAS marcados como possível duplicata (Camada 2) */
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

	// Janela de busca: backfill 90d no 1º sync, senão último sync −24h (overlap).
	const fromDate = lastSyncedAt
		? new Date(lastSyncedAt.getTime() - OVERLAP_HOURS * 60 * 60 * 1000)
		: new Date(Date.now() - BACKFILL_DAYS * 24 * 60 * 60 * 1000);
	const createdAtFrom = toBusinessDay(fromDate);

	// Busca as transações da account CREDIT vinculada.
	let pluggyTransactions: PluggyTransaction[];
	let next: unknown;
	try {
		const page = await listTransactions(pluggyAccountId, { createdAtFrom });
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
	const existing = await db
		.select({
			name: transactions.name,
			amount: transactions.amount,
			purchaseDate: transactions.purchaseDate,
		})
		.from(transactions)
		.where(
			and(
				eq(transactions.userId, connection.userId),
				eq(transactions.cardId, cardId),
			),
		);

	const seenKeys = new Set<string>();
	for (const row of existing) {
		// `purchaseDate` é um `date` (sem hora) — o driver pg o traz à meia-noite
		// UTC. Extrair o dia por UTC-slice (NÃO por toBusinessDay, que converteria
		// para SP e voltaria um dia). Isso casa com o dia que gravamos abaixo, que
		// é derivado do MESMO UTC-slice da data da transação Pluggy.
		const localDay = purchaseDayKey(row.purchaseDate);
		const cents = toCents(Number.parseFloat(row.amount));
		seenKeys.add(contentKey(localDay, cents, row.name));
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
				billPeriodCache.set(billId, derivePeriodFromDate(bill.dueDate.slice(0, 10)));
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
	let duplicateFlagged = 0;
	let alreadyExisted = 0;

	for (const tx of pluggyTransactions) {
		const description = tx.description ?? MISSING_DESCRIPTION;
		// A Pluggy manda a data ISO UTC; derivamos o dia local (SP) e usamos ele
		// como data de compra E como base do período de fatura.
		const localDay = toBusinessDay(new Date(tx.date));
		const purchaseDate = new Date(`${localDay}T12:00:00.000Z`);
		// Período pelo billId (banco) quando disponível; senão, fallback na
		// heurística (transação sem billId ou /bills que falhou). O billId é o
		// primary porque acerta o fechamento real; a heurística é rede de segurança.
		const billId = tx.creditCardMetadata?.billId;
		const period =
			(billId && billPeriodCache.get(billId)) ||
			deriveCreditCardPeriod(localDay, card.closingDay, card.dueDay);
		const cents = toCents(tx.amount);
		const key = contentKey(localDay, cents, description);
		const isDuplicate = seenKeys.has(key);

		// ⚠️ Convenção de sinal do CARTÃO de crédito na Pluggy é o OPOSTO da conta:
		// amount POSITIVO = compra (despesa/dívida), NEGATIVO = pagamento/estorno
		// (crédito que abate a fatura). Confirmado com dados reais (banco Santander
		// via MeuPluggy): compra vinha "+", pagamento "−". NÃO usar tx.type
		// (não-confiável em cartão). Alinhamos à convenção do SISTEMA — igual ao
		// import de OFX (import-action.ts): Despesa → amount NEGATIVO; Receita →
		// amount POSITIVO. Derivamos o tipo e aplicamos o sinal coerente (não
		// gravamos o sinal cru da Pluggy, que invertia tudo).
		const isExpense = tx.amount > 0;
		const transactionType = isExpense ? "Despesa" : "Receita";
		const signedAmount = isExpense ? -Math.abs(tx.amount) : Math.abs(tx.amount);
		const categoryId = mappings[normalizeDescriptionKey(description)] ?? null;

		const [row] = await db
			.insert(transactions)
			.values({
				name: isDuplicate ? DUPLICATE_PREFIX + description : description,
				condition: "À vista",
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
				importBatchId,
			})
			.onConflictDoNothing({
				target: [transactions.userId, transactions.ofxFitId],
				where: sql`${transactions.ofxFitId} is not null`,
			})
			.returning({ id: transactions.id });

		if (!row) {
			alreadyExisted += 1;
			continue;
		}
		if (isDuplicate) {
			duplicateFlagged += 1;
		} else {
			inserted += 1;
		}
		seenKeys.add(key);
	}

	// Sucesso → carimba lastSyncedAt e limpa status (mesma semântica do de conta).
	const now = new Date();
	await db
		.update(openFinanceConnections)
		.set({ lastSyncedAt: now, updatedAt: now, status: "UPDATED" })
		.where(eq(openFinanceConnections.id, connection.id));

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

	// 3. Janela de busca. Primeiro sync = backfill 90d; seguintes = último sync −24h.
	const fromDate = lastSyncedAt
		? new Date(lastSyncedAt.getTime() - OVERLAP_HOURS * 60 * 60 * 1000)
		: new Date(Date.now() - BACKFILL_DAYS * 24 * 60 * 60 * 1000);
	const createdAtFrom = toBusinessDay(fromDate);

	// 4. Busca só a account vinculada (o pluggyAccountId já é a conta-corrente).
	let transactions: PluggyTransaction[];
	let next: unknown;
	try {
		const page = await listTransactions(connection.pluggyAccountId, {
			createdAtFrom,
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
