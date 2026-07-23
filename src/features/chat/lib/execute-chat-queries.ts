import { and, desc, eq, inArray, isNull, or, sql, sum } from "drizzle-orm";
import { categories, financialAccounts, transactions } from "@/db/schema";
import { ACCOUNT_AUTO_INVOICE_NOTE_PREFIX } from "@/shared/lib/accounts/constants";
import { excludeTransactionsFromExcludedAccounts } from "@/shared/lib/accounts/query-filters";
import { db } from "@/shared/lib/db";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";

const toNumber = (value: string | number | null | undefined) => {
	if (typeof value === "number") return value;
	if (typeof value === "string") {
		const parsed = Number.parseFloat(value);
		return Number.isNaN(parsed) ? 0 : parsed;
	}
	return 0;
};

const getCurrentPeriod = () => {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

// ── consultar_resumo_mensal ──────────────────────────────────────────────────

export type CategorySummary = {
	categoryId: string | null;
	categoryName: string;
	categoryIcon: string | null;
	spent: number;
	percentage: number;
};

export type MonthlySummary = {
	period: string;
	totalReceitas: number;
	totalDespesas: number;
	saldo: number;
	byCategory: CategorySummary[];
};

export async function fetchMonthlySummaryForChat(
	userId: string,
	period?: string,
	opts?: { untilToday?: boolean; accountId?: string },
): Promise<MonthlySummary> {
	const targetPeriod = period ?? getCurrentPeriod();
	const adminPayerId = await getAdminPayerId(userId);

	if (!adminPayerId) {
		return {
			period: targetPeriod,
			totalReceitas: 0,
			totalDespesas: 0,
			saldo: 0,
			byCategory: [],
		};
	}

	const commonWhere = and(
		eq(transactions.userId, userId),
		eq(transactions.period, targetPeriod),
		eq(transactions.payerId, adminPayerId),
		or(
			isNull(transactions.note),
			sql`${transactions.note} NOT LIKE ${`${ACCOUNT_AUTO_INVOICE_NOTE_PREFIX}%`}`,
		),
		// A exclusão de contas "fora do saldo" (ex: VR/VA) só vale na visão geral.
		// Quando a IA pede uma conta específica, o usuário quer VER aquela conta
		// mesmo que ela seja excluída do saldo — senão o VR voltaria zerado.
		opts?.accountId ? undefined : excludeTransactionsFromExcludedAccounts(),
		// "até agora / já gastei" → só lançamentos com data até hoje, sem contar
		// agendados no futuro (mesmo padrão de cards/queries.ts e actions/core.ts).
		// Coluna é date puro, então current_date (timezone da sessão) basta.
		opts?.untilToday
			? sql`${transactions.purchaseDate} <= current_date`
			: undefined,
		// "do VR", "na 99pay" → isola a conta. Sem isso a IA juntava contas
		// diferentes no olho (contava despesa da 99pay como gasto de VR).
		opts?.accountId ? eq(transactions.accountId, opts.accountId) : undefined,
	);

	// Totais por tipo (receita e despesa)
	const totaisPorTipo = await db
		.select({
			transactionType: transactions.transactionType,
			total: sum(transactions.amount).as("total"),
		})
		.from(transactions)
		.leftJoin(
			financialAccounts,
			eq(transactions.accountId, financialAccounts.id),
		)
		.where(commonWhere)
		.groupBy(transactions.transactionType);

	const totalReceitas = Math.abs(
		toNumber(totaisPorTipo.find((r) => r.transactionType === "Receita")?.total),
	);
	const totalDespesas = Math.abs(
		toNumber(totaisPorTipo.find((r) => r.transactionType === "Despesa")?.total),
	);

	// Breakdown por categoria (só despesas)
	const porCategoria = await db
		.select({
			categoryId: transactions.categoryId,
			total: sum(transactions.amount).as("total"),
		})
		.from(transactions)
		.leftJoin(
			financialAccounts,
			eq(transactions.accountId, financialAccounts.id),
		)
		.where(and(commonWhere, eq(transactions.transactionType, "Despesa")))
		.groupBy(transactions.categoryId);

	const categoryIds = porCategoria
		.map((r) => r.categoryId)
		.filter((id): id is string => Boolean(id));

	const categoryRows =
		categoryIds.length > 0
			? await db.query.categories.findMany({
					columns: { id: true, name: true, icon: true },
					where: inArray(categories.id, categoryIds),
				})
			: [];

	const nameMap = new Map(categoryRows.map((c) => [c.id, c]));

	const byCategory: CategorySummary[] = porCategoria
		.map((row) => {
			const spent = Math.abs(toNumber(row.total));
			const cat = row.categoryId ? nameMap.get(row.categoryId) : undefined;
			return {
				categoryId: row.categoryId,
				categoryName: cat?.name ?? "Sem categoria",
				categoryIcon: cat?.icon ?? null,
				spent,
				percentage:
					totalDespesas > 0 ? Math.round((spent / totalDespesas) * 100) : 0,
			};
		})
		.sort((a, b) => b.spent - a.spent);

	return {
		period: targetPeriod,
		totalReceitas,
		totalDespesas,
		saldo: totalReceitas - totalDespesas,
		byCategory,
	};
}

// ── listar_transacoes ────────────────────────────────────────────────────────

export type TransactionItem = {
	id: string;
	name: string;
	amount: number;
	transactionType: string;
	condition: string;
	categoryName: string | null;
	categoryIcon: string | null;
	purchaseDate: string;
	period: string;
	isSettled: boolean | null;
};

export async function fetchTransactionsForChat(
	userId: string,
	opts: {
		period?: string;
		categoryId?: string;
		limit?: number;
		untilToday?: boolean;
		accountId?: string;
	},
): Promise<TransactionItem[]> {
	const targetPeriod = opts.period ?? getCurrentPeriod();
	const limit = Math.min(opts.limit ?? 20, 50);
	const adminPayerId = await getAdminPayerId(userId);

	if (!adminPayerId) return [];

	const rows = await db
		.select({
			id: transactions.id,
			name: transactions.name,
			amount: transactions.amount,
			transactionType: transactions.transactionType,
			condition: transactions.condition,
			purchaseDate: transactions.purchaseDate,
			period: transactions.period,
			isSettled: transactions.isSettled,
			categoryName: categories.name,
			categoryIcon: categories.icon,
		})
		.from(transactions)
		.leftJoin(
			financialAccounts,
			eq(transactions.accountId, financialAccounts.id),
		)
		.leftJoin(categories, eq(transactions.categoryId, categories.id))
		.where(
			and(
				eq(transactions.userId, userId),
				eq(transactions.period, targetPeriod),
				eq(transactions.payerId, adminPayerId),
				opts.categoryId
					? eq(transactions.categoryId, opts.categoryId)
					: undefined,
				or(
					isNull(transactions.note),
					sql`${transactions.note} NOT LIKE ${`${ACCOUNT_AUTO_INVOICE_NOTE_PREFIX}%`}`,
				),
				// Conta específica pedida → não aplicar a exclusão de saldo (senão
				// VR/VA, que é fora-do-saldo, voltaria vazio). Ver comentário gêmeo
				// em fetchMonthlySummaryForChat.
				opts.accountId ? undefined : excludeTransactionsFromExcludedAccounts(),
				opts.untilToday
					? sql`${transactions.purchaseDate} <= current_date`
					: undefined,
				opts.accountId ? eq(transactions.accountId, opts.accountId) : undefined,
			),
		)
		.orderBy(desc(transactions.purchaseDate), desc(transactions.createdAt))
		.limit(limit);

	return rows.map((t) => ({
		id: t.id,
		name: t.name,
		amount: Math.abs(toNumber(t.amount)),
		transactionType: t.transactionType,
		condition: t.condition,
		categoryName: t.categoryName ?? null,
		categoryIcon: t.categoryIcon ?? null,
		purchaseDate:
			t.purchaseDate instanceof Date
				? t.purchaseDate.toISOString().slice(0, 10)
				: String(t.purchaseDate),
		period: t.period,
		isSettled: t.isSettled,
	}));
}
