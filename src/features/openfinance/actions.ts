"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { openFinanceConnections } from "@/db/schema";
import { createConnectToken } from "@/features/openfinance/lib/pluggy-client";
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

		const { accessToken } = await createConnectToken();
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
 * F1 só remove LOCALMENTE — NÃO chama DELETE do item na Pluggy (decisão: o
 * escopo da F1 é desvincular do app; a exclusão do lado da Pluggy/consentimento
 * fica para uma fase futura). Lançamentos já criados na Inbox permanecem.
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
