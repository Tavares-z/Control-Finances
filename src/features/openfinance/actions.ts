"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { cards, financialAccounts, openFinanceConnections } from "@/db/schema";
import {
	createConnectToken,
	deleteItem,
	listAccounts,
	PluggyApiError,
} from "@/features/openfinance/lib/pluggy-client";
import { syncOpenFinanceConnection } from "@/features/openfinance/sync";
import { auth } from "@/shared/lib/auth/config";
import { db } from "@/shared/lib/db";

type ActionResponse<T = void> = {
	success: boolean;
	message?: string;
	error?: string;
	data?: T;
};

const FLAG_ERROR = "Open Finance desabilitado";
const AUTH_ERROR = "Não autenticado";

function isOpenFinanceEnabled(): boolean {
	return process.env.OPENFINANCE_ENABLED?.trim().toLowerCase() === "true";
}

/**
 * Monta a URL pública do receptor de webhook a partir de BETTER_AUTH_URL (a URL
 * canônica do app, já usada pelo Better Auth). É essa URL que a Pluggy passa a
 * chamar em item/error, transactions/created, etc.
 *
 * Retorna undefined quando a base é ausente ou localhost/HTTP — a Pluggy EXIGE
 * HTTPS e proíbe localhost, então em dev o connect token simplesmente sai sem
 * webhookUrl (a conexão funciona, só não recebe eventos em tempo real). Sem
 * isso, dev quebraria a criação do token. Em staging/prod (HTTPS público) a URL
 * é montada normalmente.
 */
function resolveWebhookUrl(): string | undefined {
	const base = process.env.BETTER_AUTH_URL?.trim();
	if (!base) return undefined;
	let url: URL;
	try {
		url = new URL(base);
	} catch {
		return undefined;
	}
	if (url.protocol !== "https:") return undefined;
	// Sem porta explícita de localhost/loopback (a Pluggy rejeita).
	if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
		return undefined;
	}
	return new URL("/api/webhooks/pluggy", url).toString();
}

/**
 * Gera um connect token da Pluggy para inicializar o widget Pluggy Connect no
 * cliente. NÃO expõe a apiKey do servidor — só o accessToken de curta duração
 * do widget, que o front usa para abrir o fluxo de conexão.
 *
 * F1 não recebe input (itemId/modo update fica para depois), então não há
 * schema Zod a validar aqui — a validação relevante é sessão + flag.
 */
export async function createConnectTokenAction(): Promise<
	ActionResponse<{ accessToken: string }>
> {
	try {
		const session = await auth.api.getSession({ headers: await headers() });
		if (!session?.user?.id) {
			return { success: false, error: AUTH_ERROR };
		}
		if (!isOpenFinanceEnabled()) {
			return { success: false, error: FLAG_ERROR };
		}

		const { accessToken } = await createConnectToken({
			webhookUrl: resolveWebhookUrl(),
		});
		return { success: true, data: { accessToken } };
	} catch (error) {
		// Nunca ecoa o token/credenciais — PluggyApiError só carrega status/code.
		console.error("[createConnectTokenAction]", error);
		return {
			success: false,
			error: "Não foi possível iniciar a conexão com o banco.",
		};
	}
}

const reconnectConnectionSchema = z.object({
	itemId: z.string().uuid("Item inválido"),
});

/**
 * Gera um connect token de UPDATE para reautenticar um item existente na Pluggy
 * (fluxo de reconexão após LOGIN_ERROR/consentimento expirado). Diferente da
 * `createConnectTokenAction`, recebe o `itemId` e o repassa a `createConnectToken`,
 * que abre o widget em modo UPDATE do item — NÃO cria conexão nova.
 *
 * Ownership é o ponto crítico de segurança: só emite o token se o `itemId`
 * pertencer a uma conexão DO USUÁRIO logado (SELECT por pluggyItemId + userId).
 * Sem isso, um usuário poderia passar o itemId de outro e ganhar um token de
 * UPDATE sobre conexão alheia.
 *
 * Shape de sucesso idêntico à `createConnectTokenAction`: { success, data:{ accessToken } }.
 */
export async function reconnectConnectionAction(
	itemId: string,
): Promise<ActionResponse<{ accessToken: string }>> {
	try {
		const session = await auth.api.getSession({ headers: await headers() });
		if (!session?.user?.id) {
			return { success: false, error: AUTH_ERROR };
		}
		if (!isOpenFinanceEnabled()) {
			return { success: false, error: FLAG_ERROR };
		}

		const parsed = reconnectConnectionSchema.safeParse({ itemId });
		if (!parsed.success) {
			return {
				success: false,
				error: parsed.error.issues[0]?.message ?? "Dados inválidos",
			};
		}

		// Ownership: o item precisa pertencer a uma conexão do usuário logado.
		const [connection] = await db
			.select({ id: openFinanceConnections.id })
			.from(openFinanceConnections)
			.where(
				and(
					eq(openFinanceConnections.pluggyItemId, parsed.data.itemId),
					eq(openFinanceConnections.userId, session.user.id),
				),
			);
		if (!connection) {
			return { success: false, error: "Conexão não encontrada" };
		}

		// Token em modo UPDATE do item existente (o client repassa o itemId).
		// Reassocia o webhookUrl para garantir que o item continue notificando após
		// a reconexão (o widget UPDATE recria o consentimento).
		const { accessToken } = await createConnectToken({
			itemId: parsed.data.itemId,
			webhookUrl: resolveWebhookUrl(),
		});
		return { success: true, data: { accessToken } };
	} catch (error) {
		// Nunca ecoa o token/credenciais — PluggyApiError só carrega status/code.
		console.error("[reconnectConnectionAction]", error);
		return {
			success: false,
			error: "Não foi possível iniciar a reconexão com o banco.",
		};
	}
}

const registerConnectionSchema = z.object({
	pluggyItemId: z.string().uuid("Item inválido"),
	connectorName: z.string().optional(),
});

/**
 * Registra (ou atualiza) uma conexão Open Finance após o widget Pluggy Connect
 * concluir com sucesso no cliente. Idempotente por (user_id, pluggy_item_id):
 * reconectar o mesmo item só atualiza o connectorName/updatedAt.
 *
 * F1 NÃO vincula conta local (accountId permanece null — o vínculo do devtest
 * foi feito manualmente e não é tocado aqui).
 */
export async function registerConnectionAction(
	input: z.input<typeof registerConnectionSchema>,
): Promise<ActionResponse> {
	try {
		const session = await auth.api.getSession({ headers: await headers() });
		if (!session?.user?.id) {
			return { success: false, error: AUTH_ERROR };
		}
		if (!isOpenFinanceEnabled()) {
			return { success: false, error: FLAG_ERROR };
		}

		const parsed = registerConnectionSchema.safeParse(input);
		if (!parsed.success) {
			return {
				success: false,
				error: parsed.error.issues[0]?.message ?? "Dados inválidos",
			};
		}

		const connectorName = parsed.data.connectorName ?? null;
		await db
			.insert(openFinanceConnections)
			.values({
				userId: session.user.id,
				pluggyItemId: parsed.data.pluggyItemId,
				connectorName,
			})
			// Alvo do conflito = índice único composto (user_id, pluggy_item_id),
			// que é NÃO-parcial — declarar as duas colunas basta, sem predicado
			// (diferente do 42P10 dos índices parciais em pre_lancamentos).
			.onConflictDoUpdate({
				target: [
					openFinanceConnections.userId,
					openFinanceConnections.pluggyItemId,
				],
				set: { connectorName, updatedAt: new Date() },
			});

		revalidatePath("/settings");
		return { success: true, message: "Banco conectado." };
	} catch (error) {
		console.error("[registerConnectionAction]", error);
		return {
			success: false,
			error: "Não foi possível registrar a conexão.",
		};
	}
}

const disconnectConnectionSchema = z.object({
	connectionId: z.string().uuid("Conexão inválida"),
});

/**
 * Desconecta (remove) uma conexão Open Finance do usuário. Ownership vai na
 * própria cláusula WHERE (id + user_id), não em query separada.
 *
 * Best-effort: TENTA excluir o item na Pluggy (DELETE /items/{id}) antes de
 * remover o registro local, mas uma falha ali NÃO impede a desconexão — o
 * registro local é removido de qualquer forma e a falha é só logada (sem
 * credenciais). Um item órfão na Pluggy é menos ruim que o usuário travado sem
 * conseguir desconectar. Lançamentos já criados na Inbox permanecem.
 */
export async function disconnectConnectionAction(
	input: z.input<typeof disconnectConnectionSchema>,
): Promise<ActionResponse> {
	try {
		const session = await auth.api.getSession({ headers: await headers() });
		if (!session?.user?.id) {
			return { success: false, error: AUTH_ERROR };
		}
		if (!isOpenFinanceEnabled()) {
			return { success: false, error: FLAG_ERROR };
		}

		const parsed = disconnectConnectionSchema.safeParse(input);
		if (!parsed.success) {
			return {
				success: false,
				error: parsed.error.issues[0]?.message ?? "Dados inválidos",
			};
		}

		// Ownership + pega o pluggyItemId para o DELETE na Pluggy. Se não achar a
		// conexão do usuário, não chama a Pluggy nem deleta — retorna cedo.
		const [connection] = await db
			.select({
				id: openFinanceConnections.id,
				pluggyItemId: openFinanceConnections.pluggyItemId,
			})
			.from(openFinanceConnections)
			.where(
				and(
					eq(openFinanceConnections.id, parsed.data.connectionId),
					eq(openFinanceConnections.userId, session.user.id),
				),
			);

		if (!connection) {
			return { success: false, error: "Conexão não encontrada" };
		}

		// Best-effort: exclui o item na Pluggy. Try/catch PRÓPRIO e estreito —
		// só a chamada Pluggy. Sucesso ou falha, o fluxo segue para o delete
		// local. Log sem credenciais (espelha o catch de sync.ts).
		try {
			await deleteItem(connection.pluggyItemId);
		} catch (error) {
			if (error instanceof PluggyApiError) {
				console.error("[disconnectConnectionAction] Pluggy deleteItem", {
					connectionId: connection.id,
					status: error.status,
					code: error.code,
					errorId: error.errorId,
					message: error.message,
				});
			} else {
				const err = error as Error;
				console.error("[disconnectConnectionAction] network deleteItem", {
					connectionId: connection.id,
					name: err.name,
					message: err.message,
				});
			}
			// Falha na Pluggy NÃO aborta: segue para o delete local.
		}

		// Delete local do registro (ownership de novo na WHERE).
		const deleted = await db
			.delete(openFinanceConnections)
			.where(
				and(
					eq(openFinanceConnections.id, parsed.data.connectionId),
					eq(openFinanceConnections.userId, session.user.id),
				),
			)
			.returning({ id: openFinanceConnections.id });

		if (deleted.length === 0) {
			return { success: false, error: "Conexão não encontrada" };
		}

		revalidatePath("/settings");
		return { success: true, message: "Conexão desconectada." };
	} catch (error) {
		console.error("[disconnectConnectionAction]", error);
		return {
			success: false,
			error: "Não foi possível desconectar a conexão.",
		};
	}
}

// Tipo pré-pago que NÃO deve receber vínculo Open Finance: VR/VA é saldo
// pré-pago sem conexão bancária, e vinculá-lo colidiria com o widget de VR/VA
// (que depende de excludeFromBalance/lógica de ritmo). Mesma constante literal
// usada em account-form-fields.tsx.
const VR_ACCOUNT_TYPE = "Pré-Pago | VR/VA";

/** Opção de conta Pluggy devolvida ao cliente quando há 2+ contas BANK. */
export interface PluggyAccountOption {
	pluggyAccountId: string;
	/** Rótulo do produto (name/marketingName) — sem number/balance. */
	label: string;
}

const linkConnectionAccountSchema = z.object({
	connectionId: z.string().uuid("Conexão inválida"),
	localAccountId: z.string().uuid("Conta inválida"),
	// Presente só no 2º passo (desambiguação quando o banco tem 2+ contas BANK).
	// Re-validado contra listAccounts no servidor — nunca confiado cru.
	pluggyAccountId: z.string().optional(),
});

/**
 * Vincula uma conexão Open Finance a uma conta local, fechando o gate do sync
 * (que exige accountId + pluggyAccountId — sync.ts:89-95). Fluxo de 2 níveis
 * com colapso no servidor:
 *   - 1 conta BANK (type !== "CREDIT") no item → grava direto.
 *   - 2+ contas BANK → devolve as opções (needsPluggyChoice) para o cliente
 *     escolher; a 2ª chamada traz o pluggyAccountId, re-validado aqui.
 *
 * Ownership: conexão pela WHERE (id + userId); conta local por SELECT explícito
 * (id + userId) antes de gravar. Regra 1 conta local = 1 conexão validada em
 * código (não há unique constraint em conta_id — decisão desta entrega).
 *
 * Auto-sync pós-vínculo: best-effort em try/catch interno. Se falhar, o vínculo
 * PERMANECE gravado e a action retorna sucesso do vínculo. Cada vínculo dispara
 * 1 chamada de atualização à Pluggy (conta na cota por CPF).
 */
export async function linkConnectionAccountAction(
	input: z.input<typeof linkConnectionAccountSchema>,
): Promise<
	ActionResponse<{ needsPluggyChoice: true; options: PluggyAccountOption[] }>
> {
	try {
		const session = await auth.api.getSession({ headers: await headers() });
		if (!session?.user?.id) {
			return { success: false, error: AUTH_ERROR };
		}
		if (!isOpenFinanceEnabled()) {
			return { success: false, error: FLAG_ERROR };
		}

		const parsed = linkConnectionAccountSchema.safeParse(input);
		if (!parsed.success) {
			return {
				success: false,
				error: parsed.error.issues[0]?.message ?? "Dados inválidos",
			};
		}
		const { connectionId, localAccountId, pluggyAccountId } = parsed.data;
		const userId = session.user.id;

		// 1. Conexão do usuário (ownership + pega o pluggyItemId para listAccounts).
		const [connection] = await db
			.select({
				id: openFinanceConnections.id,
				pluggyItemId: openFinanceConnections.pluggyItemId,
			})
			.from(openFinanceConnections)
			.where(
				and(
					eq(openFinanceConnections.id, connectionId),
					eq(openFinanceConnections.userId, userId),
				),
			);
		if (!connection) {
			return { success: false, error: "Conexão não encontrada" };
		}

		// 2. Ownership da conta local + rejeita tipo VR/VA (não recebe vínculo OF).
		const [localAccount] = await db
			.select({
				id: financialAccounts.id,
				accountType: financialAccounts.accountType,
			})
			.from(financialAccounts)
			.where(
				and(
					eq(financialAccounts.id, localAccountId),
					eq(financialAccounts.userId, userId),
				),
			);
		if (!localAccount) {
			return { success: false, error: "Conta não encontrada" };
		}
		if (localAccount.accountType === VR_ACCOUNT_TYPE) {
			return {
				success: false,
				error: "Contas VR/VA não podem ser vinculadas ao Open Finance.",
			};
		}

		// 3. Regra 1 conta local = 1 conexão: bloqueia se OUTRA conexão já usa a
		//    conta (permite re-vincular a mesma conexão à mesma conta).
		const [conflict] = await db
			.select({ id: openFinanceConnections.id })
			.from(openFinanceConnections)
			.where(
				and(
					eq(openFinanceConnections.userId, userId),
					eq(openFinanceConnections.accountId, localAccountId),
					ne(openFinanceConnections.id, connectionId),
				),
			);
		if (conflict) {
			return {
				success: false,
				error: "Esta conta já está vinculada a outra conexão.",
			};
		}

		// 4. Lista as contas Pluggy do item e filtra cartão (type !== "CREDIT").
		let bankAccounts: Awaited<ReturnType<typeof listAccounts>>;
		try {
			const accounts = await listAccounts(connection.pluggyItemId);
			bankAccounts = accounts.filter((a) => a.type !== "CREDIT");
		} catch (error) {
			// pluggy-client já garante que PluggyApiError não carrega credencial.
			console.error("[linkConnectionAccountAction] listAccounts", error);
			return {
				success: false,
				error: "Não foi possível ler as contas do banco.",
			};
		}

		if (bankAccounts.length === 0) {
			return {
				success: false,
				error: "Nenhuma conta compatível neste banco.",
			};
		}

		// 5. Resolve QUAL conta Pluggy vincular.
		let chosenPluggyAccountId: string;
		if (bankAccounts.length === 1) {
			// Colapso para 1 nível.
			chosenPluggyAccountId = bankAccounts[0].id;
		} else if (pluggyAccountId) {
			// 2º passo: re-valida o id vindo do cliente contra a lista real.
			const match = bankAccounts.find((a) => a.id === pluggyAccountId);
			if (!match) {
				return { success: false, error: "Conta bancária inválida." };
			}
			chosenPluggyAccountId = match.id;
		} else {
			// 1º passo com ambiguidade: devolve as opções para o cliente escolher.
			return {
				success: true,
				data: {
					needsPluggyChoice: true,
					options: bankAccounts.map((a) => ({
						pluggyAccountId: a.id,
						label: a.name ?? a.marketingName ?? "Conta",
					})),
				},
			};
		}

		// 6. Grava o vínculo (ownership da conexão de novo na WHERE).
		await db
			.update(openFinanceConnections)
			.set({
				accountId: localAccountId,
				pluggyAccountId: chosenPluggyAccountId,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(openFinanceConnections.id, connectionId),
					eq(openFinanceConnections.userId, userId),
				),
			);

		// 7. Auto-sync best-effort: falha aqui NÃO desfaz o vínculo. Custa 1
		//    chamada de atualização Pluggy (cota por CPF).
		try {
			await syncOpenFinanceConnection(connectionId);
		} catch (error) {
			console.error("[linkConnectionAccountAction] auto-sync", error);
		}

		revalidatePath("/settings");
		return { success: true, message: "Conta vinculada." };
	} catch (error) {
		console.error("[linkConnectionAccountAction]", error);
		return {
			success: false,
			error: "Não foi possível vincular a conta.",
		};
	}
}

const linkConnectionCardSchema = z.object({
	connectionId: z.string().uuid("Conexão inválida"),
	localCardId: z.string().uuid("Cartão inválido"),
	// Presente só no 2º passo (desambiguação quando o item tem 2+ cartões CREDIT).
	// Re-validado contra listAccounts no servidor — nunca confiado cru.
	pluggyAccountId: z.string().optional(),
});

/**
 * Vincula uma conexão Open Finance a um CARTÃO local (Fase 2), fechando o gate do
 * sync para o caminho de cartão (que exige cardId + pluggyAccountId). Espelha a
 * `linkConnectionAccountAction`, com três diferenças:
 *   - filtra a account Pluggy por `type === "CREDIT"` (o OPOSTO da de conta);
 *   - valida ownership de CARTÃO (não há checagem de VR/VA — cartão não tem
 *     accountType; VR/VA é conta, não cartão);
 *   - grava `cardId` (e limpa `accountId` para não deixar a conexão apontando para
 *     os dois — uma conexão de cartão é de cartão).
 *
 * Colapso de 2 níveis idêntico: 1 cartão CREDIT no item → grava direto; 2+ →
 * devolve as opções (needsPluggyChoice) para o cliente escolher; a 2ª chamada traz
 * o pluggyAccountId, re-validado aqui.
 *
 * Regra 1 cartão local = 1 conexão validada em código (não há unique constraint em
 * cartao_id — mesma decisão consciente da de conta). Auto-sync best-effort
 * pós-vínculo: falha não desfaz o vínculo.
 */
export async function linkConnectionCardAction(
	input: z.input<typeof linkConnectionCardSchema>,
): Promise<
	ActionResponse<{ needsPluggyChoice: true; options: PluggyAccountOption[] }>
> {
	try {
		const session = await auth.api.getSession({ headers: await headers() });
		if (!session?.user?.id) {
			return { success: false, error: AUTH_ERROR };
		}
		if (!isOpenFinanceEnabled()) {
			return { success: false, error: FLAG_ERROR };
		}

		const parsed = linkConnectionCardSchema.safeParse(input);
		if (!parsed.success) {
			return {
				success: false,
				error: parsed.error.issues[0]?.message ?? "Dados inválidos",
			};
		}
		const { connectionId, localCardId, pluggyAccountId } = parsed.data;
		const userId = session.user.id;

		// 1. Conexão do usuário (ownership + pega o pluggyItemId para listAccounts).
		const [connection] = await db
			.select({
				id: openFinanceConnections.id,
				pluggyItemId: openFinanceConnections.pluggyItemId,
			})
			.from(openFinanceConnections)
			.where(
				and(
					eq(openFinanceConnections.id, connectionId),
					eq(openFinanceConnections.userId, userId),
				),
			);
		if (!connection) {
			return { success: false, error: "Conexão não encontrada" };
		}

		// 2. Ownership do cartão local.
		const [localCard] = await db
			.select({ id: cards.id })
			.from(cards)
			.where(and(eq(cards.id, localCardId), eq(cards.userId, userId)));
		if (!localCard) {
			return { success: false, error: "Cartão não encontrado" };
		}

		// 3. Regra 1 cartão local = 1 conexão: bloqueia se OUTRA conexão já usa o
		//    cartão (permite re-vincular a mesma conexão ao mesmo cartão).
		const [conflict] = await db
			.select({ id: openFinanceConnections.id })
			.from(openFinanceConnections)
			.where(
				and(
					eq(openFinanceConnections.userId, userId),
					eq(openFinanceConnections.cardId, localCardId),
					ne(openFinanceConnections.id, connectionId),
				),
			);
		if (conflict) {
			return {
				success: false,
				error: "Este cartão já está vinculado a outra conexão.",
			};
		}

		// 4. Lista as accounts do item e filtra SÓ cartão (type === "CREDIT").
		let creditAccounts: Awaited<ReturnType<typeof listAccounts>>;
		try {
			const accounts = await listAccounts(connection.pluggyItemId);
			creditAccounts = accounts.filter((a) => a.type === "CREDIT");
		} catch (error) {
			// pluggy-client já garante que PluggyApiError não carrega credencial.
			console.error("[linkConnectionCardAction] listAccounts", error);
			return {
				success: false,
				error: "Não foi possível ler os cartões do banco.",
			};
		}

		if (creditAccounts.length === 0) {
			return {
				success: false,
				error: "Nenhum cartão de crédito encontrado neste banco.",
			};
		}

		// 5. Resolve QUAL cartão Pluggy vincular.
		let chosenPluggyAccountId: string;
		if (creditAccounts.length === 1) {
			// Colapso para 1 nível.
			chosenPluggyAccountId = creditAccounts[0].id;
		} else if (pluggyAccountId) {
			// 2º passo: re-valida o id vindo do cliente contra a lista real.
			const match = creditAccounts.find((a) => a.id === pluggyAccountId);
			if (!match) {
				return { success: false, error: "Cartão inválido." };
			}
			chosenPluggyAccountId = match.id;
		} else {
			// 1º passo com ambiguidade: devolve as opções para o cliente escolher.
			return {
				success: true,
				data: {
					needsPluggyChoice: true,
					options: creditAccounts.map((a) => ({
						pluggyAccountId: a.id,
						label: a.name ?? a.marketingName ?? "Cartão",
					})),
				},
			};
		}

		// 6. Grava o vínculo. Seta cardId e LIMPA accountId — uma conexão vinculada a
		//    cartão não deve também apontar para conta (o sync ramifica por qual está
		//    preenchido; deixar os dois setados é ambíguo).
		await db
			.update(openFinanceConnections)
			.set({
				cardId: localCardId,
				accountId: null,
				pluggyAccountId: chosenPluggyAccountId,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(openFinanceConnections.id, connectionId),
					eq(openFinanceConnections.userId, userId),
				),
			);

		// 7. Auto-sync best-effort: falha aqui NÃO desfaz o vínculo.
		try {
			await syncOpenFinanceConnection(connectionId);
		} catch (error) {
			console.error("[linkConnectionCardAction] auto-sync", error);
		}

		revalidatePath("/settings");
		revalidatePath("/cards");
		return { success: true, message: "Cartão vinculado." };
	} catch (error) {
		console.error("[linkConnectionCardAction]", error);
		return {
			success: false,
			error: "Não foi possível vincular o cartão.",
		};
	}
}

/** Um cartão Pluggy (account CREDIT) de uma conexão, para o dialog de vínculo. */
export interface ConnectionCreditCard {
	connectionId: string;
	connectorName: string | null;
	pluggyAccountId: string;
	/** Nome do cartão na Pluggy (ex.: "Mastercard Black") — desambigua "MeuPluggy". */
	cardName: string;
}

/**
 * Lista TODOS os cartões Pluggy (accounts type=CREDIT) de TODAS as conexões do
 * usuário, achatados em uma lista para o dialog de vínculo de cartão. Resolve o
 * problema de N conexões "MeuPluggy" indistinguíveis: o rótulo real é o nome do
 * cartão (connectorName é compartilhado no uso pessoal e não desambigua).
 *
 * Uma chamada `listAccounts` por conexão, em paralelo e TOLERANTE a falha
 * individual (allSettled): uma conexão com erro na Pluggy some da lista sem
 * derrubar as demais. Conexões sem cartão CREDIT (só-conta) não entram.
 */
export async function listConnectionCreditCardsAction(): Promise<
	ActionResponse<{ cards: ConnectionCreditCard[] }>
> {
	try {
		const session = await auth.api.getSession({ headers: await headers() });
		if (!session?.user?.id) {
			return { success: false, error: AUTH_ERROR };
		}
		if (!isOpenFinanceEnabled()) {
			return { success: false, error: FLAG_ERROR };
		}

		const connections = await db
			.select({
				id: openFinanceConnections.id,
				connectorName: openFinanceConnections.connectorName,
				pluggyItemId: openFinanceConnections.pluggyItemId,
			})
			.from(openFinanceConnections)
			.where(eq(openFinanceConnections.userId, session.user.id));

		const settled = await Promise.allSettled(
			connections.map(async (connection) => {
				const accounts = await listAccounts(connection.pluggyItemId);
				return accounts
					.filter((a) => a.type === "CREDIT")
					.map((a) => ({
						connectionId: connection.id,
						connectorName: connection.connectorName,
						pluggyAccountId: a.id,
						cardName: a.name ?? a.marketingName ?? "Cartão",
					}));
			}),
		);

		const cards: ConnectionCreditCard[] = [];
		for (const result of settled) {
			if (result.status === "fulfilled") {
				cards.push(...result.value);
			} else {
				// Uma conexão falhou na Pluggy — loga sem credencial e segue.
				console.error(
					"[listConnectionCreditCardsAction] listAccounts",
					result.reason instanceof PluggyApiError
						? { status: result.reason.status, code: result.reason.code }
						: result.reason,
				);
			}
		}

		return { success: true, data: { cards } };
	} catch (error) {
		console.error("[listConnectionCreditCardsAction]", error);
		return {
			success: false,
			error: "Não foi possível carregar os cartões do banco.",
		};
	}
}
