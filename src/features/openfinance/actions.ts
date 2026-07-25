"use server";

import { headers } from "next/headers";
import { createConnectToken } from "@/features/openfinance/lib/pluggy-client";
import { auth } from "@/shared/lib/auth/config";

type ActionResponse<T = void> = {
	success: boolean;
	message?: string;
	error?: string;
	data?: T;
};

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
			return { success: false, error: "Não autenticado" };
		}

		// Mesmo gate do sync (sync.ts): flag server-side, default DESLIGADO.
		if (process.env.OPENFINANCE_ENABLED?.trim().toLowerCase() !== "true") {
			return { success: false, error: "Open Finance desabilitado" };
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
