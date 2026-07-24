import { and, eq, ilike, not } from "drizzle-orm";
import { cards, categories, financialAccounts } from "@/db/schema";
import { db } from "@/shared/lib/db";
import { getBusinessDateString } from "@/shared/utils/date";

// Este contexto é injetado no system prompt de TODA mensagem do chat (e reenviado
// a cada passo de tool call). Por isso ele carrega SÓ o que é caro/impossível de
// obter por ferramenta: a data de hoje e os IDs de contas/cartões/categorias que o
// system prompt exige para o tool calling (ver route.ts, seção "Dados para registro
// de transações"). Resumo do mês, últimos lançamentos, top categorias e orçamentos
// foram REMOVIDOS de propósito — a IA os busca sob demanda via consultar_resumo_mensal
// / listar_transacoes / consultar_orcamento, que retornam dados melhores (respeitam
// realizado×agendado, filtro por conta etc.). Antes, pré-carregar tudo inflava o input
// para ~8k tokens por request; enxugar aqui derruba o custo sem perder capacidade.
export async function buildChatContext(userId: string): Promise<string> {
	try {
		const now = new Date();
		const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

		const [accounts, userCategories, userCards] = await Promise.all([
			// Contas ativas com ID (necessário para tool calling)
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

		const todayString = getBusinessDateString(now);

		return `
## Contexto financeiro do usuário — ${currentPeriod}

Data de hoje: ${todayString}. Lançamentos com data posterior a hoje são agendados/futuros — ainda não foram gastos.
Para números do mês (saldo, gastos, categorias, orçamentos, lançamentos), use as ferramentas de consulta — não há dados pré-carregados aqui.

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
