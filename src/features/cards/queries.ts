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
import {
	cards,
	financialAccounts,
	invoices,
	openFinanceConnections,
	transactions,
} from "@/db/schema";
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
	/** Estado do vínculo Open Finance deste cartão (Fase 2). */
	openFinance: {
		/** id da conexão vinculada, ou null se o cartão não está vinculado. */
		connectionId: string | null;
		connectorName: string | null;
		lastSyncedAt: Date | null;
	};
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
		limitUsageRows,
		invoiceTotalRows,
		invoiceStatusRows,
		openFinanceRows,
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
					// Valor da fatura = SALDO DEVEDOR: soma com sinal (compras negativas
					// − estornos positivos), para bater com o "valor da fatura" do banco.
					// Não filtra por tipo: estornos DEVEM abater. O sync já NÃO traz
					// pagamento de fatura (quitação/adiantamento é fluxo à parte e é
					// ambíguo por Open Finance — ver isInvoicePayment em openfinance/sync.ts),
					// então aqui só há compras e estornos. O Math.abs no consumo torna o
					// saldo positivo para exibição.
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
		db
			.select({
				cardId: openFinanceConnections.cardId,
				connectionId: openFinanceConnections.id,
				connectorName: openFinanceConnections.connectorName,
				lastSyncedAt: openFinanceConnections.lastSyncedAt,
				pluggyAvailableCreditLimit:
					openFinanceConnections.pluggyAvailableCreditLimit,
				pluggyCreditLimit: openFinanceConnections.pluggyCreditLimit,
			})
			.from(openFinanceConnections)
			.where(
				and(
					eq(openFinanceConnections.userId, userId),
					isNotNull(openFinanceConnections.cardId),
				),
			),
	]);

	const usageMap = new Map<string, number>();
	limitUsageRows.forEach(
		(row: { cardId: string | null; total: number | null }) => {
			if (!row.cardId) return;
			usageMap.set(row.cardId, Number(row.total ?? 0));
		},
	);
	const invoiceTotalMap = new Map<string, number>();
	invoiceTotalRows.forEach(
		(row: { cardId: string | null; total: number | null }) => {
			if (!row.cardId) return;
			invoiceTotalMap.set(row.cardId, Math.abs(Number(row.total ?? 0)));
		},
	);
	const invoiceStatusMap = new Map<string, InvoicePaymentStatus>();
	invoiceStatusRows.forEach((row) => {
		if (!row.cardId) return;
		const status = parseInvoiceStatus(row.paymentStatus);
		if (!status) return;
		invoiceStatusMap.set(row.cardId, status);
	});
	const openFinanceMap = new Map<
		string,
		{
			connectionId: string;
			connectorName: string | null;
			lastSyncedAt: Date | null;
		}
	>();
	// Limite disponível reportado pelo BANCO (só cartões com OF vinculado).
	// Preferido sobre o cálculo por transações porque este não reconstrói a
	// dívida histórica anterior ao 1º sync (não passa pela Pluggy). null = sem
	// dado do banco → cai no cálculo local.
	const bankAvailableMap = new Map<string, number>();
	openFinanceRows.forEach((row) => {
		if (!row.cardId) return;
		openFinanceMap.set(row.cardId, {
			connectionId: row.connectionId,
			connectorName: row.connectorName,
			lastSyncedAt: row.lastSyncedAt,
		});
		if (row.pluggyAvailableCreditLimit != null) {
			bankAvailableMap.set(row.cardId, Number(row.pluggyAvailableCreditLimit));
		}
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
			const bankAvailable = bankAvailableMap.get(card.id);
			if (bankAvailable != null) {
				return Math.max(Number(card.limit) - bankAvailable, 0);
			}
			const total = usageMap.get(card.id) ?? 0;
			return Math.abs(total);
		})(),
		limitAvailable: (() => {
			const bankAvailable = bankAvailableMap.get(card.id);
			if (bankAvailable != null) {
				return Math.max(bankAvailable, 0);
			}
			const total = usageMap.get(card.id) ?? 0;
			const inUse = Math.abs(total);
			return Math.max(Number(card.limit) - inUse, 0);
		})(),
		currentInvoiceAmount: invoiceTotalMap.get(card.id) ?? 0,
		currentInvoiceLabel,
		currentInvoiceStatus: invoiceStatusMap.get(card.id) ?? null,
		accountId: card.accountId,
		accountName:
			(card.financialAccount as { name?: string } | null)?.name ??
			"Conta não encontrada",
		openFinance: {
			connectionId: openFinanceMap.get(card.id)?.connectionId ?? null,
			connectorName: openFinanceMap.get(card.id)?.connectorName ?? null,
			lastSyncedAt: openFinanceMap.get(card.id)?.lastSyncedAt ?? null,
		},
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
