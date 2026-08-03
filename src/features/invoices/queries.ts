import { and, eq, type SQL, sum } from "drizzle-orm";
import { cards, invoices, transactions } from "@/db/schema";
import { fetchTransactionsWithRelations } from "@/features/transactions/queries";
import {
	buildInvoiceAdvanceNote,
	buildInvoicePaymentNote,
} from "@/shared/lib/accounts/constants";
import { db } from "@/shared/lib/db";
import {
	INVOICE_PAYMENT_STATUS,
	type InvoicePaymentStatus,
} from "@/shared/lib/invoices";

const toNumber = (value: string | number | null | undefined) => {
	if (typeof value === "number") {
		return value;
	}
	if (value === null || value === undefined) {
		return 0;
	}
	const parsed = Number(value);
	return Number.isNaN(parsed) ? 0 : parsed;
};

export async function fetchCardData(userId: string, cardId: string) {
	const card = await db.query.cards.findFirst({
		columns: {
			id: true,
			name: true,
			brand: true,
			closingDay: true,
			dueDay: true,
			logo: true,
			limit: true,
			status: true,
			note: true,
			accountId: true,
		},
		where: and(eq(cards.id, cardId), eq(cards.userId, userId)),
	});

	return card;
}

export async function fetchInvoiceData(
	userId: string,
	cardId: string,
	selectedPeriod: string,
): Promise<{
	totalAmount: number;
	invoiceStatus: InvoicePaymentStatus;
	paymentDate: Date | null;
	advancedAmount: number;
}> {
	const advanceCardNote = buildInvoiceAdvanceNote(
		cardId,
		selectedPeriod,
		"card",
	);
	const [invoiceRow, totalRow, advanceRow] = await Promise.all([
		db.query.invoices.findFirst({
			columns: {
				id: true,
				period: true,
				paymentStatus: true,
			},
			where: and(
				eq(invoices.cardId, cardId),
				eq(invoices.userId, userId),
				eq(invoices.period, selectedPeriod),
			),
		}),
		db
			.select({ totalAmount: sum(transactions.amount) })
			.from(transactions)
			.where(
				and(
					eq(transactions.userId, userId),
					eq(transactions.cardId, cardId),
					eq(transactions.period, selectedPeriod),
					// Saldo devedor: soma com sinal (compras − estornos). Sem filtro de
					// tipo — estornos abatem. Pagamento de fatura não entra (o sync não
					// o traz). O adiantamento (perna-cartão) É um crédito no período e
					// ENTRA nesta soma de propósito — abate o total. Ver cards/queries.ts.
				),
			),
		// Quanto já foi adiantado neste período (perna-cartão do adiantamento).
		db
			.select({ total: sum(transactions.amount) })
			.from(transactions)
			.where(
				and(
					eq(transactions.userId, userId),
					eq(transactions.note, advanceCardNote),
				),
			),
	]);

	const totalAmount = toNumber(totalRow[0]?.totalAmount);
	const advancedAmount = Math.abs(toNumber(advanceRow[0]?.total));
	const isInvoiceStatus = (
		value: string | null | undefined,
	): value is InvoicePaymentStatus =>
		!!value && ["pendente", "pago"].includes(value);

	const invoiceStatus = isInvoiceStatus(invoiceRow?.paymentStatus)
		? invoiceRow?.paymentStatus
		: INVOICE_PAYMENT_STATUS.PENDING;

	// Buscar data do pagamento se a fatura estiver paga
	let paymentDate: Date | null = null;
	if (invoiceStatus === INVOICE_PAYMENT_STATUS.PAID) {
		const invoiceNote = buildInvoicePaymentNote(cardId, selectedPeriod);
		const paymentLancamento = await db.query.transactions.findFirst({
			columns: {
				purchaseDate: true,
			},
			where: and(
				eq(transactions.userId, userId),
				eq(transactions.note, invoiceNote),
			),
		});
		paymentDate = paymentLancamento?.purchaseDate
			? new Date(paymentLancamento.purchaseDate)
			: null;
	}

	return { totalAmount, invoiceStatus, paymentDate, advancedAmount };
}

export async function fetchCardTransactions(filters: SQL[]) {
	return fetchTransactionsWithRelations({ filters });
}
