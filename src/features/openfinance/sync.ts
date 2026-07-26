import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { inboxItems, openFinanceConnections } from "@/db/schema";
import {
	listTransactions,
	PluggyApiError,
	type PluggyTransaction,
} from "@/features/openfinance/lib/pluggy-client";
import { db } from "@/shared/lib/db";
import { getBusinessDateString } from "@/shared/utils/date";

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

/** Chave de conteúdo da Camada 2: dia local | centavos | descrição. */
function contentKey(
	localDay: string,
	cents: number,
	description: string,
): string {
	return `${localDay}|${cents}|${description.trim()}`;
}

export async function syncOpenFinanceConnection(
	connectionId: string,
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
	if (!connection.pluggyAccountId || !connection.accountId) {
		return {
			status: "skipped",
			...empty,
			message: "Conexão sem conta Pluggy/local vinculada.",
		};
	}

	// 2. Throttle: sincronizado há menos de 1h → no-op imediato.
	const { lastSyncedAt } = connection;
	if (lastSyncedAt && Date.now() - lastSyncedAt.getTime() < THROTTLE_MS) {
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
	const now = new Date();
	await db
		.update(openFinanceConnections)
		.set({ lastSyncedAt: now, updatedAt: now })
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
