import {
	PAYMENT_METHODS,
	TRANSACTION_CONDITIONS,
	TRANSACTION_TYPES,
} from "@/features/transactions/lib/constants";

export const INITIAL_BALANCE_CATEGORY_NAME = "Saldo inicial";
export const INITIAL_BALANCE_NOTE = "saldo inicial";

export const INITIAL_BALANCE_CONDITION =
	TRANSACTION_CONDITIONS.find((condition) => condition === "À vista") ??
	"À vista";
export const INITIAL_BALANCE_PAYMENT_METHOD =
	PAYMENT_METHODS.find((method) => method === "Pix") ?? "Pix";
export const INITIAL_BALANCE_TRANSACTION_TYPE =
	TRANSACTION_TYPES.find((type) => type === "Receita") ?? "Receita";

export const ACCOUNT_AUTO_INVOICE_NOTE_PREFIX = "AUTO_FATURA:";

export const buildInvoicePaymentNote = (cardId: string, period: string) =>
	`${ACCOUNT_AUTO_INVOICE_NOTE_PREFIX}${cardId}:${period}`;

export const INVOICE_ADJUSTMENT_NAME = "Ajuste de fatura";

/**
 * Ajuste de fatura: nota técnica que começa com AUTO_FATURA: para o lançamento
 * HERDAR as ~15 exclusões `NOT LIKE 'AUTO_FATURA:%'` do app (receitas/despesas/
 * relatórios/orçamento/chat) — assim o ajuste corrige o total DA FATURA sem contar
 * como despesa/receita real no dashboard (bug real: ajuste entrava como "Outras
 * despesas" e inflava o gasto geral). Formato: AUTO_FATURA:{cardId}:{period}:adj.
 * O `:adj` (4 partes) garante `parts.length !== 3` (pagamento) e `!== 6`
 * (adiantamento) — não colide com o paymentMap nem com isInvoiceAdvanceNote. Nota
 * técnica pura, sem texto livre: o ajuste é localizado por name =
 * INVOICE_ADJUSTMENT_NAME (não pela nota), e o texto "era X, correto Y" vai no
 * toast de sucesso, não na nota — assim o prefixo nunca vaza na UI.
 */
export const buildInvoiceAdjustmentNote = (cardId: string, period: string) =>
	`${ACCOUNT_AUTO_INVOICE_NOTE_PREFIX}${cardId}:${period}:adj`;

/**
 * Adiantamento de fatura: PAR de lançamentos (perna "card" + perna "account")
 * ligados por um `id` único por adiantamento — permite VÁRIOS adiantamentos no
 * mesmo período, cada um com sua data/valor/conta.
 *
 * ⚠️ A nota começa com ACCOUNT_AUTO_INVOICE_NOTE_PREFIX ("AUTO_FATURA:") DE
 * PROPÓSITO: assim herda as ~15 exclusões espalhadas pelo app (NOT LIKE
 * 'AUTO_FATURA:%' em receitas/despesas/relatórios/orçamento) sem tocar em cada
 * uma — a perna "card" é um crédito (Receita) que NÃO pode contar como receita
 * real. O segmento ":adv:" e o formato de 6 partes distinguem do pagamento de
 * fatura (3 partes, "AUTO_FATURA:cardId:period"). O único ponto que precisa
 * separar os dois é o paymentMap em dashboard/invoices/invoices-queries.ts, que
 * exige `parts.length === 3` (pagamento) e ignora os 6-partes (adiantamento).
 *
 * O prefixo NÃO afeta o abate do total da fatura: as somas de fatura
 * (currentInvoiceAmount, fetchInvoiceData, adminShare) somam por cardId+period
 * SEM filtrar nota, então a perna "card" abate o total de qualquer forma.
 */
export const buildInvoiceAdvanceNote = (
	cardId: string,
	period: string,
	leg: "card" | "account",
	id: string,
) => `${ACCOUNT_AUTO_INVOICE_NOTE_PREFIX}${cardId}:${period}:adv:${leg}:${id}`;

/** True se a nota é de um adiantamento (formato de 6 partes com ":adv:"). */
export const isInvoiceAdvanceNote = (note: string | null | undefined) => {
	if (!note?.startsWith(ACCOUNT_AUTO_INVOICE_NOTE_PREFIX)) return false;
	const parts = note.split(":");
	return parts.length === 6 && parts[3] === "adv";
};

/** Extrai { id, leg } de uma nota de adiantamento, ou null se não for. */
export const parseInvoiceAdvanceNote = (note: string | null | undefined) => {
	if (!isInvoiceAdvanceNote(note)) return null;
	const parts = (note as string).split(":");
	const leg = parts[4];
	const id = parts[5];
	if ((leg !== "card" && leg !== "account") || !id) return null;
	return { leg, id } as { leg: "card" | "account"; id: string };
};

export const INVOICE_ADVANCE_NAME = "Adiantamento de fatura";

export const ACCOUNT_BALANCE_ADJUSTMENT_NAME = "Ajuste de saldo";

export const REFUND_NOTE_PREFIX = "AUTO_REEMBOLSO:";

export const buildRefundNote = (originalTransactionId: string) =>
	`${REFUND_NOTE_PREFIX}${originalTransactionId}`;

export const isRefundNote = (note: string | null | undefined) =>
	note?.startsWith(REFUND_NOTE_PREFIX) ?? false;

export const isAccountInactive = (status: string | null | undefined) =>
	status?.toLowerCase() === "inativa";

/**
 * Lançamentos técnicos criados pelo sistema (saldo inicial / ajuste de saldo)
 * não têm forma de pagamento real — o `paymentMethod` é apenas um carimbo
 * default ("Pix"). Usado para ocultar o rótulo na tabela de lançamentos.
 */
export const hasNoRealPaymentMethod = (item: {
	name?: string | null;
	categoriaName?: string | null;
}) =>
	item.name === ACCOUNT_BALANCE_ADJUSTMENT_NAME ||
	item.categoriaName === INITIAL_BALANCE_CATEGORY_NAME;
