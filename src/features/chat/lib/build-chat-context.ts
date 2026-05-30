import { db } from "@/shared/lib/db";
import { transactions, financialAccounts, categories, budgets } from "@/db/schema";
import { eq, and, gte, lte, desc, sum, count } from "drizzle-orm";
import { formatCurrency } from "@/shared/utils/currency";

export async function buildChatContext(userId: string): Promise<string> {
	const now = new Date();
	const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
	const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
	const threeMonthsAgoPeriod = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, "0")}`;

	const [accounts, currentTransactions, topCategories, activeBudgets] =
		await Promise.all([
			// Contas e saldos
			db.query.financialAccounts.findMany({
				where: and(
					eq(financialAccounts.userId, userId),
					eq(financialAccounts.status, "ativa"),
				),
			}),

			// Transações do mês atual
			db.query.transactions.findMany({
				where: and(
					eq(transactions.userId, userId),
					eq(transactions.period, currentPeriod),
				),
				with: { category: true },
				orderBy: [desc(transactions.purchaseDate)],
				limit: 50,
			}),

			// Top categorias dos últimos 3 meses
			db
				.select({
					categoryName: categories.name,
					total: sum(transactions.amount),
					qtd: count(transactions.id),
				})
				.from(transactions)
				.innerJoin(categories, eq(transactions.categoryId, categories.id))
				.where(
					and(
						eq(transactions.userId, userId),
						eq(transactions.transactionType, "despesa"),
						gte(transactions.period, threeMonthsAgoPeriod),
						lte(transactions.period, currentPeriod),
					),
				)
				.groupBy(categories.name)
				.orderBy(desc(sum(transactions.amount)))
				.limit(8),

			// Orçamentos ativos
			db.query.budgets.findMany({
				where: and(
					eq(budgets.userId, userId),
					eq(budgets.period, currentPeriod),
				),
				with: { category: true },
			}),
		]);

	const totalIncome = currentTransactions
		.filter((t) => t.transactionType === "receita")
		.reduce((acc, t) => acc + Number(t.amount), 0);

	const totalExpenses = currentTransactions
		.filter((t) => t.transactionType === "despesa")
		.reduce((acc, t) => acc + Number(t.amount), 0);

	const balance = totalIncome - totalExpenses;

	const recentTransactions = currentTransactions.slice(0, 10).map((t) => ({
		nome: t.name,
		valor: formatCurrency(Number(t.amount)),
		tipo: t.transactionType,
		categoria: t.category?.name ?? "Sem categoria",
		data: t.purchaseDate,
	}));

	const context = `
## Contexto financeiro do usuário — ${currentPeriod}

### Resumo do mês atual
- Total de receitas: ${formatCurrency(totalIncome)}
- Total de despesas: ${formatCurrency(totalExpenses)}
- Saldo do mês: ${formatCurrency(balance)}

### Contas ativas
${accounts.map((a) => `- ${a.name} (${a.accountType})`).join("\n") || "Nenhuma conta cadastrada"}

### Top categorias de gastos (últimos 3 meses)
${topCategories.map((c) => `- ${c.categoryName}: ${formatCurrency(Number(c.total))} (${c.qtd} lançamentos)`).join("\n") || "Sem dados"}

### Orçamentos ativos em ${currentPeriod}
${activeBudgets.map((b) => `- ${b.category?.name ?? "Sem categoria"}: limite ${formatCurrency(Number(b.amount))}`).join("\n") || "Nenhum orçamento ativo"}

### Últimos 10 lançamentos
${recentTransactions.map((t) => `- ${t.data} | ${t.tipo} | ${t.nome} | ${t.valor} | ${t.categoria}`).join("\n")}
`.trim();

	return context;
}