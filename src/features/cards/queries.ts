import {
	and,
	eq,
	ilike,
	isNotNull,
	isNull,
	ne,
	not,
	or,
	sql,
} from "drizzle-orm";
import { cards, financialAccounts, invoices, transactions } from "@/db/schema";
import { db } from "@/shared/lib/db";
import {
	INVOICE_PAYMENT_STATUS,
	INVOICE_STATUS_VALUES,
	type InvoicePaymentStatus,
} from "@/shared/lib/invoices";
import { loadLogoOptions } from "@/shared/lib/logo/options";
import {
	formatPeriodMonthShort,
	getCurrentPeriod,
	parsePeriod,
} from "@/shared/utils/period";

type CardData = {
	id: string;
	name: string;
	brand: string;
	status: string;
	closingDay: string;
	dueDay: string;
	note: string | null;
	logo: string | null;
	limit: number;
	limitInUse: number;
	limitAvailable: number;
	currentInvoiceAmount: number;
	currentInvoiceLabel: string;
	currentInvoiceStatus: InvoicePaymentStatus | null;
	accountId: string;
	accountName: string;
};

type AccountSimple = {
	id: string;
	name: string;
	logo: string | null;
};

function formatCurrentInvoiceLabel(period: string) {
	const { year } = parsePeriod(period);
	return `Fatura ${formatPeriodMonthShort(period)}. ${year}`;
}

function parseInvoiceStatus(value: unknown): InvoicePaymentStatus | null {
	return INVOICE_STATUS_VALUES.includes(value as InvoicePaymentStatus)
		? (value as InvoicePaymentStatus)
		: null;
}

async function fetchCardsByStatus(
	userId: string,
	archived: boolean,
): Promise<{
	cards: CardData[];
	accounts: AccountSimple[];
	logoOptions: string[];
}> {
	const currentPeriod = getCurrentPeriod();
	const currentInvoiceLabel = formatCurrentInvoiceLabel(currentPeriod);
	const [
		cardRows,
		accountRows,
		logoOptions,
		usageRows,
		invoiceRows,
		invoiceStatusRows,
	] = await Promise.all([
		db.query.cards.findMany({
			orderBy: (table, { desc }) => [desc(table.name)],
			where: and(
				eq(cards.userId, userId),
				archived
					? ilike(cards.status, "inativo")
					: not(ilike(cards.status, "inativo")),
			),
			with: {
				financialAccount: {
					columns: {
						id: true,
						name: true,
					},
				},
			},
		}),
		db.query.financialAccounts.findMany({
			orderBy: (table, { desc }) => [desc(table.name)],
			where: eq(financialAccounts.userId, userId),
			columns: {
				id: true,
				name: true,
				logo: true,
			},
		}),
		loadLogoOptions(),
		db
			.select({
				cardId: transactions.cardId,
				total: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
			})
			.from(transactions)
			.leftJoin(
				invoices,
				and(
					eq(invoices.userId, transactions.userId),
					eq(invoices.cardId, transactions.cardId),
					eq(invoices.period, transactions.period),
				),
			)
			.where(
				and(
					eq(transactions.userId, userId),
					isNotNull(transactions.cardId),
					or(
						isNull(invoices.paymentStatus),
						ne(invoices.paymentStatus, INVOICE_PAYMENT_STATUS.PAID),
					),
					// Recorrente no cartão: só consome limite quando a data da ocorrência já passou
					or(
						ne(transactions.condition, "Recorrente"),
						sql`${transactions.purchaseDate} <= current_date`,
					),
				),
			)
			.groupBy(transactions.cardId),
		db
			.select({
				cardId: transactions.cardId,
				total: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
			})
			.from(transactions)
			.where(
				and(
					eq(transactions.userId, userId),
					eq(transactions.period, currentPeriod),
				),
			)
			.groupBy(transactions.cardId),
		db
			.select({
				cardId: invoices.cardId,
				paymentStatus: invoices.paymentStatus,
			})
			.from(invoices)
			.where(
				and(eq(invoices.userId, userId), eq(invoices.period, currentPeriod)),
			),
	]);

	const usageMap = new Map<string, number>();
	usageRows.forEach((row: { cardId: string | null; total: number | null }) => {
		if (!row.cardId) return;
		usageMap.set(row.cardId, Number(row.total ?? 0));
	});
	const invoiceMap = new Map<string, number>();
	invoiceRows.forEach(
		(row: { cardId: string | null; total: number | null }) => {
			if (!row.cardId) return;
			invoiceMap.set(row.cardId, Math.abs(Number(row.total ?? 0)));
		},
	);
	const invoiceStatusMap = new Map<string, InvoicePaymentStatus>();
	invoiceStatusRows.forEach((row) => {
		if (!row.cardId) return;
		const status = parseInvoiceStatus(row.paymentStatus);
		if (!status) return;
		invoiceStatusMap.set(row.cardId, status);
	});

	const cardList = cardRows.map((card) => ({
		id: card.id,
		name: card.name,
		brand: card.brand ?? "",
		status: card.status ?? "",
		closingDay: card.closingDay,
		dueDay: card.dueDay,
		note: card.note,
		logo: card.logo,
		limit: Number(card.limit),
		limitInUse: (() => {
			const total = usageMap.get(card.id) ?? 0;
			return Math.abs(total);
		})(),
		limitAvailable: (() => {
			const total = usageMap.get(card.id) ?? 0;
			const inUse = Math.abs(total);
			return Math.max(Number(card.limit) - inUse, 0);
		})(),
		currentInvoiceAmount: invoiceMap.get(card.id) ?? 0,
		currentInvoiceLabel,
		currentInvoiceStatus: invoiceStatusMap.get(card.id) ?? null,
		accountId: card.accountId,
		accountName:
			(card.financialAccount as { name?: string } | null)?.name ??
			"Conta não encontrada",
	}));

	const accounts = accountRows.map((account) => ({
		id: account.id,
		name: account.name,
		logo: account.logo,
	}));

	return { cards: cardList, accounts, logoOptions };
}

async function fetchCardsForUser(userId: string): Promise<{
	cards: CardData[];
	accounts: AccountSimple[];
	logoOptions: string[];
}> {
	return fetchCardsByStatus(userId, false);
}

async function fetchInactiveForUser(userId: string): Promise<{
	cards: CardData[];
	accounts: AccountSimple[];
	logoOptions: string[];
}> {
	return fetchCardsByStatus(userId, true);
}

export async function fetchAllCardsForUser(userId: string): Promise<{
	activeCards: CardData[];
	archivedCards: CardData[];
	accounts: AccountSimple[];
	logoOptions: string[];
}> {
	const [activeData, archivedData] = await Promise.all([
		fetchCardsForUser(userId),
		fetchInactiveForUser(userId),
	]);

	return {
		activeCards: activeData.cards,
		archivedCards: archivedData.cards,
		accounts: activeData.accounts,
		logoOptions: activeData.logoOptions,
	};
}
