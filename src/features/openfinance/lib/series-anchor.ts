import "server-only";

import type { PluggyTransaction } from "@/features/openfinance/lib/pluggy-client";

/**
 * ÂNCORA DE SÉRIE do Open Finance (cartão parcelado).
 *
 * Problema que resolve: a Pluggy entrega as parcelas de UMA compra de forma
 * fragmentada — trunca a descrição de formas diferentes entre parcelas da mesma
 * compra (`MERCADOLIVRE*HUSTLECOM` nas parcelas 1-4, `MERCADOLIVRE*HUST` nas 5-8)
 * e o valor da parcela oscila (1ª 25,04 vs 24,98 nas demais). Qualquer chave por
 * (descrição, valor) estilhaça uma compra física em 2-3 "séries" — o que já
 * causou bug real (banir uma cancelada apagava parcelas de outra legítima) e
 * poluía a dedup.
 *
 * A âncora ESTÁVEL é `creditCardMetadata.purchaseDate` — a data/hora exata da
 * compra, IDÊNTICA entre todas as parcelas da mesma compra e distinta entre
 * compras diferentes (confirmado com dado real: a HUSTLECOM 8x traz
 * `2026-04-23T19:29:02.000Z` em TODAS as 8 parcelas; presente em 100% das
 * parcelas dos 3 cartões testados). Combinada com `cardId` e `totalInstallments`,
 * identifica a série sem depender de descrição/valor.
 */

/** Chave canônica de série do OF: cartão + purchaseDate + total de parcelas. */
export interface SeriesAnchor {
	cardId: string;
	/** `creditCardMetadata.purchaseDate` cru (ISO 8601). */
	purchaseAnchor: string;
	/** total de parcelas (>= 2 para série; 1/null = compra à vista). */
	totalInstallments: number | null;
}

/**
 * Deriva a âncora de série de uma transação Pluggy. Retorna null quando falta o
 * `purchaseDate` no metadado (degradação suave: sem âncora, o sync cai no
 * caminho antigo por transação, sem consolidar/projetar essa compra). `cardId`
 * é o cartão LOCAL (a account Pluggy já foi resolvida para ele no vínculo).
 */
export function seriesAnchorFromTransaction(
	cardId: string,
	tx: PluggyTransaction,
): SeriesAnchor | null {
	const purchaseAnchor = tx.creditCardMetadata?.purchaseDate ?? null;
	if (!purchaseAnchor) return null;
	const total = tx.creditCardMetadata?.totalInstallments ?? null;
	return {
		cardId,
		purchaseAnchor,
		totalInstallments: total != null && total >= 2 ? total : null,
	};
}

/**
 * Serializa a âncora para chave de Map/Set. Só o purchaseAnchor + total (o cardId
 * já filtra o conjunto). Formato: `purchaseAnchor|total` (total "-" quando null).
 */
export function serializeAnchor(anchor: SeriesAnchor): string {
	return `${anchor.purchaseAnchor}|${anchor.totalInstallments ?? "-"}`;
}

/**
 * True quando a parcela é um CANCELAMENTO (compra fantasma estornada no lojista).
 *
 * ⚠️ Contradiz a nota antiga do AGENTS.md ("a Pluggy não sinaliza cancelamento").
 * Ela SINALIZA nestes campos (confirmado com dado real):
 *  - `otherCreditsAdditionalInfo`: compra = `"Purchase:MultInstConsMerc"`,
 *    cancelamento = `"Refund:MultInstConsMercCanc"` (sufixo `Canc`).
 *  - `feeTypeAdditionalInfo`: cancelamento = `"...merchant_canceled - refund"`.
 *
 * Basta um dos dois sinalizar. Casa por substring, case-insensitive, para
 * tolerar variação de caixa/pontuação entre bancos.
 */
export function isCanceledInstallment(tx: PluggyTransaction): boolean {
	const meta = tx.creditCardMetadata;
	if (!meta) return false;
	const other = (meta.otherCreditsAdditionalInfo ?? "").toLowerCase();
	const fee = (meta.feeTypeAdditionalInfo ?? "").toLowerCase();
	return other.includes("canc") || fee.includes("canceled");
}
