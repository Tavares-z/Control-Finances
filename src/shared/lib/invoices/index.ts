export const INVOICE_PAYMENT_STATUS = {
	PENDING: "pendente",
	PAID: "pago",
} as const;

export const INVOICE_STATUS_VALUES = Object.values(INVOICE_PAYMENT_STATUS);

export type InvoicePaymentStatus =
	(typeof INVOICE_PAYMENT_STATUS)[keyof typeof INVOICE_PAYMENT_STATUS];

export const INVOICE_STATUS_LABEL: Record<InvoicePaymentStatus, string> = {
	[INVOICE_PAYMENT_STATUS.PENDING]: "Em aberto",
	[INVOICE_PAYMENT_STATUS.PAID]: "Pago",
};

export const INVOICE_STATUS_BADGE_VARIANT: Record<
	InvoicePaymentStatus,
	"default" | "secondary" | "success" | "info"
> = {
	[INVOICE_PAYMENT_STATUS.PENDING]: "info",
	[INVOICE_PAYMENT_STATUS.PAID]: "success",
};

export const INVOICE_STATUS_DESCRIPTION: Record<InvoicePaymentStatus, string> =
	{
		[INVOICE_PAYMENT_STATUS.PENDING]:
			"Esta fatura ainda não foi quitada. Você pode realizar o pagamento assim que revisar os lançamentos.",
		[INVOICE_PAYMENT_STATUS.PAID]:
			"Esta fatura está quitada. Caso tenha sido um engano, é possível desfazer o pagamento.",
	};

export const PERIOD_FORMAT_REGEX = /^\d{4}-\d{2}$/;

/**
 * Estado do CICLO de uma fatura (independe de estar paga ou não):
 * - "aberta": o ciclo ainda não fechou — novas compras ainda entram nela.
 * - "fechada": o ciclo já fechou (hoje já passou do dia de fechamento) — novas
 *   compras vão para a fatura seguinte, não para esta.
 *
 * O `period` (YYYY-MM) é o mês de VENCIMENTO da fatura (convenção do app). A data
 * de fechamento do ciclo é derivada assim:
 * - Se `dueDay >= closingDay` (fecha e vence no mesmo mês — ex.: fecha 05, vence
 *   10): o fechamento é no dia `closingDay` do PRÓPRIO mês do período.
 * - Se `dueDay < closingDay` (vence no mês seguinte ao que fecha — ex.: Santander
 *   fecha 30, vence 07): o fechamento é no dia `closingDay` do mês ANTERIOR ao
 *   período (a fatura que vence em setembro fechou em 30/agosto).
 *
 * `closingDay` é normalizado ao último dia do mês quando excede (ex.: fecha 30 em
 * fevereiro → dia 28/29). Datas comparadas ao MEIO-DIA local para evitar
 * ambiguidade de fuso. Retorna "aberta" se os dias forem inválidos (degradação
 * suave — nunca sinaliza "fechada" por engano).
 */
export type InvoiceCycleStatus = "aberta" | "fechada";

export function getInvoiceCycleStatus(
	period: string,
	closingDay: string | number | null | undefined,
	dueDay: string | number | null | undefined,
	today: Date = new Date(),
): InvoiceCycleStatus {
	const match = /^(\d{4})-(\d{2})$/.exec(period);
	if (!match) return "aberta";
	const year = Number.parseInt(match[1], 10);
	const month = Number.parseInt(match[2], 10); // 1-12

	const closing = Number.parseInt(String(closingDay ?? ""), 10);
	const due = Number.parseInt(String(dueDay ?? ""), 10);
	if (Number.isNaN(closing) || Number.isNaN(due)) return "aberta";

	// Mês (1-12) em que o ciclo fecha: mesmo mês do período, ou o anterior quando
	// a fatura vence no mês seguinte ao fechamento.
	let closingYear = year;
	let closingMonth = month;
	if (due < closing) {
		closingMonth -= 1;
		if (closingMonth === 0) {
			closingMonth = 12;
			closingYear -= 1;
		}
	}

	// Normaliza o dia ao último dia do mês de fechamento (fecha 30 em fev, etc.).
	const lastDay = new Date(closingYear, closingMonth, 0).getDate();
	const day = Math.min(closing, lastDay);

	const closingDate = new Date(closingYear, closingMonth - 1, day, 12, 0, 0, 0);
	const now = new Date(
		today.getFullYear(),
		today.getMonth(),
		today.getDate(),
		12,
		0,
		0,
		0,
	);
	// Fechamento INCLUSIVO (>=): no próprio dia de fechamento a fatura já é
	// considerada fechada. Alinha com deriveCreditCardPeriod, onde uma compra no
	// dia do fechamento (`purchaseDay >= closingDay`) já entra no ciclo seguinte.
	return now >= closingDate ? "fechada" : "aberta";
}
