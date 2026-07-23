import { and, count, desc, eq, gte, ilike, lte, not, sum } from "drizzle-orm";
import {
	budgets,
	cards,
	categories,
	financialAccounts,
	transactions,
} from "@/db/schema";
import { db } from "@/shared/lib/db";
import { formatCurrency } from "@/shared/utils/currency";
import { getBusinessDateString } from "@/shared/utils/date";

export async function buildChatContext(userId: string): Promise<string> {
	try {
		const now = new Date();
		const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
		const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
		const threeMonthsAgoPeriod = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, "0")}`;

		const [
			accounts,
			currentTransactions,
			topCategories,
			activeBudgets,
			userCategories,
			userCards,
		] = await Promise.all([
			// Contas ativas com ID
			db
				.select({
					id: financialAccounts.id,
					name: financialAccounts.name,
					accountType: financialAccounts.accountType,
				})
				.from(financialAccounts)
				.where(
					and(
						eq(financialAccounts.userId, userId),
						not(ilike(financialAccounts.status, "inativa")),
					),
				),

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
						eq(transactions.transactionType, "Despesa"),
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

			// Todas as categorias do usuário (para tool calling)
			db
				.select({
					id: categories.id,
					name: categories.name,
					type: categories.type,
				})
				.from(categories)
				.where(eq(categories.userId, userId))
				.orderBy(categories.name),

			// Todos os cartões do usuário (para tool calling)
			db
				.select({
					id: cards.id,
					name: cards.name,
				})
				.from(cards)
				.where(eq(cards.userId, userId)),
		]);

		const totalIncome = currentTransactions
			.filter((t) => t.transactionType === "Receita")
			.reduce((acc, t) => acc + Number(t.amount), 0);

		const totalExpenses = currentTransactions
			.filter((t) => t.transactionType === "Despesa")
			.reduce((acc, t) => acc + Number(t.amount), 0);

		const balance = totalIncome - totalExpenses;

		const recentTransactions = currentTransactions.slice(0, 10).map((t) => ({
			nome: t.name,
			valor: formatCurrency(Number(t.amount)),
			tipo: t.transactionType,
			categoria: t.category?.name ?? "Sem categoria",
			data: t.purchaseDate,
		}));

		const todayString = getBusinessDateString(now);

		return `
## Contexto financeiro do usuário — ${currentPeriod}

Data de hoje: ${todayString}. Lançamentos com data posterior a hoje são agendados/futuros — ainda não foram gastos.

### Resumo do mês atual
- Total de receitas: ${formatCurrency(totalIncome)}
- Total de despesas: ${formatCurrency(totalExpenses)}
- Saldo do mês: ${formatCurrency(balance)}

### Top categorias de gastos (últimos 3 meses)
${topCategories.map((c) => `- ${c.categoryName}: ${formatCurrency(Number(c.total))} (${c.qtd} lançamentos)`).join("\n") || "Sem dados"}

### Orçamentos ativos em ${currentPeriod}
${activeBudgets.map((b) => `- ${b.category?.name ?? "Sem categoria"}: limite ${formatCurrency(Number(b.amount))}`).join("\n") || "Nenhum orçamento ativo"}

### Últimos 10 lançamentos
${recentTransactions.map((t) => `- ${t.data} | ${t.tipo} | ${t.nome} | ${t.valor} | ${t.categoria}`).join("\n")}

---
## Dados para registro de transações (use os IDs EXATOS ao chamar ferramentas)

### Contas disponíveis
${accounts.length > 0 ? accounts.map((a) => `- ID: ${a.id} | ${a.name} (${a.accountType})`).join("\n") : "Nenhuma conta ativa cadastrada"}

### Cartões de crédito disponíveis
${userCards.length > 0 ? userCards.map((c) => `- ID: ${c.id} | ${c.name}`).join("\n") : "Nenhum cartão cadastrado"}

### Categorias disponíveis
${userCategories.length > 0 ? userCategories.map((c) => `- ID: ${c.id} | ${c.name} (${c.type})`).join("\n") : "Nenhuma categoria cadastrada"}
`.trim();
	} catch (error) {
		console.error("Erro ao construir contexto financeiro:", error);
		return "Contexto financeiro indisponível no momento.";
	}
}
