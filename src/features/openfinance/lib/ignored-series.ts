import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { openFinanceIgnoredSeries, transactions } from "@/db/schema";
import { db } from "@/shared/lib/db";

/**
 * "Séries ignoradas" do Open Finance: compras que a Pluggy entrega como POSTED
 * válidas mas que foram canceladas no lojista e nunca estornadas (a Pluggy NÃO
 * sinaliza cancelamento em campo nenhum — confirmado por dump cru; só o usuário
 * sabe). Ao excluir uma parcela dessas na lista, banimos a SÉRIE inteira e o sync
 * nunca mais a reinsere.
 *
 * Chave da série (estável entre parcelas e no pending→posted, que troca o ofxFitId):
 *   - PARCELADA: (userId, cardId, descrição, totalParcelas, |centavos da parcela|).
 *     ⚠️ O valor da parcela ENTRA na chave (mudança ago/2026). Antes era só
 *     (descrição, total) — mas a Pluggy TRUNCA a descrição de formas diferentes entre
 *     parcelas da MESMA compra (visto real: `MERCADOLIVRE*HUSTLECOM` nas parcelas 1-4
 *     e `MERCADOLIVRE*HUST` nas 5-8 da MESMA compra). Isso fazia DUAS compras distintas
 *     de mesmo total colapsarem na mesma chave — e banir uma (cancelada, 24,98) apagava
 *     as parcelas da outra (legítima, 20,49), que truncava para a mesma string `HUST`.
 *     Incluir o valor separa 24,98 de 20,49. Custo aceito: a 1ª parcela às vezes tem
 *     valor diferente das demais (visto: 25,04 vs 24,98) — então banir uma parcela de
 *     24,98 não pega a de 25,04; o usuário bane essa com 1 clique extra (degradação
 *     suave e VISÍVEL, muito melhor que apagar compra legítima em silêncio).
 *   - À VISTA (sem parcela): (userId, cardId, descrição, |centavos|). O total é null,
 *     então o valor entra na chave para não banir toda compra de mesma descrição.
 */

/** |valor| em centavos inteiros (mesma convenção do sync). */
function toCents(amount: number): number {
	return Math.round(Math.abs(amount) * 100);
}

export interface SeriesKey {
	cardId: string;
	description: string;
	/** total de parcelas; null = compra à vista. */
	installmentCount: number | null;
	/** |centavos|, só quando à vista (installmentCount null); senão null. */
	amountKey: number | null;
}

/**
 * Deriva a chave de série a partir de uma transação. `amountKey` (|centavos|) SEMPRE
 * entra na chave — para parcelada é o valor da parcela, para à vista é o valor da
 * compra (ver comentário do módulo: a descrição truncada pela Pluggy não é confiável
 * para desambiguar séries, então o valor é necessário mesmo na parcelada). `cardId`
 * é obrigatório (só cartão tem série de OF); retorna null se ausente.
 */
export function seriesKeyFromTransaction(tx: {
	cardId: string | null;
	name: string;
	installmentCount: number | null;
	amount: number;
}): SeriesKey | null {
	if (!tx.cardId) return null;
	const parcelada = tx.installmentCount != null && tx.installmentCount >= 2;
	return {
		cardId: tx.cardId,
		description: tx.name,
		installmentCount: parcelada ? tx.installmentCount : null,
		amountKey: toCents(tx.amount),
	};
}

/** WHERE que casa exatamente uma SeriesKey (trata os nullables com is/eq). */
function matchSeriesWhere(userId: string, key: SeriesKey) {
	return and(
		eq(openFinanceIgnoredSeries.userId, userId),
		eq(openFinanceIgnoredSeries.cardId, key.cardId),
		eq(openFinanceIgnoredSeries.description, key.description),
		key.installmentCount == null
			? isNull(openFinanceIgnoredSeries.installmentCount)
			: eq(openFinanceIgnoredSeries.installmentCount, key.installmentCount),
		key.amountKey == null
			? isNull(openFinanceIgnoredSeries.amountKey)
			: eq(openFinanceIgnoredSeries.amountKey, key.amountKey),
	);
}

/**
 * Bane uma série (idempotente) E apaga do banco todas as transações de OF que
 * casam a chave (a parcela clicada + as irmãs). Só toca transações com ofxFitId
 * preenchido — registro manual nunca é apagado. Roda numa transação para o banimento
 * e a limpeza serem atômicos.
 *
 * @returns quantas transações foram apagadas.
 */
export async function banSeriesAndDeleteMatches(
	userId: string,
	key: SeriesKey,
): Promise<number> {
	return db.transaction(async (tx: typeof db) => {
		await tx
			.insert(openFinanceIgnoredSeries)
			.values({
				userId,
				cardId: key.cardId,
				description: key.description,
				installmentCount: key.installmentCount,
				amountKey: key.amountKey,
			})
			.onConflictDoNothing();

		// Apaga as transações de OF que casam a série. Em AMBOS os casos casa pelo valor
		// absoluto (centavos) — ver comentário do módulo: a descrição truncada pela
		// Pluggy não desambigua séries, então o valor é obrigatório também na parcelada
		// para não apagar uma compra legítima de mesma descrição/total e valor diferente.
		const conds = [
			eq(transactions.userId, userId),
			eq(transactions.cardId, key.cardId),
			eq(transactions.name, key.description),
			sql`${transactions.ofxFitId} is not null`,
			sql`round(abs(${transactions.amount}) * 100) = ${key.amountKey}`,
		];
		if (key.installmentCount == null) {
			conds.push(isNull(transactions.installmentCount));
		} else {
			conds.push(eq(transactions.installmentCount, key.installmentCount));
		}
		const deleted = await tx
			.delete(transactions)
			.where(and(...conds))
			.returning({ id: transactions.id });
		return deleted.length;
	});
}

/**
 * Carrega todas as séries banidas de um cartão como um Set de chaves serializadas,
 * para o sync consultar em memória (evita 1 query por transação). Formato da chave
 * serializada: `descrição|total|amountKey` (total/amountKey = "-" quando null).
 */
export async function loadIgnoredSeriesKeys(
	userId: string,
	cardId: string,
): Promise<Set<string>> {
	const rows = await db
		.select({
			description: openFinanceIgnoredSeries.description,
			installmentCount: openFinanceIgnoredSeries.installmentCount,
			amountKey: openFinanceIgnoredSeries.amountKey,
		})
		.from(openFinanceIgnoredSeries)
		.where(
			and(
				eq(openFinanceIgnoredSeries.userId, userId),
				eq(openFinanceIgnoredSeries.cardId, cardId),
			),
		);
	return new Set(
		rows.map((r) =>
			serializeSeriesKey({
				cardId,
				description: r.description,
				installmentCount: r.installmentCount,
				amountKey: r.amountKey,
			}),
		),
	);
}

/** Serializa uma SeriesKey para lookup em Set (sem o cardId, já filtrado na query). */
export function serializeSeriesKey(key: SeriesKey): string {
	return `${key.description}|${key.installmentCount ?? "-"}|${key.amountKey ?? "-"}`;
}

// Reexporta o matchSeriesWhere só para testes/uso avançado (não usado externamente).
export { matchSeriesWhere };
