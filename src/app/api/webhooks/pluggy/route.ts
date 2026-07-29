import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { openFinanceConnections } from "@/db/schema";
import { verifyPluggyWebhookToken } from "@/features/openfinance/lib/pluggy-client";
import {
	refreshConnectionStatus,
	syncOpenFinanceConnection,
} from "@/features/openfinance/sync";
import { db } from "@/shared/lib/db";

/**
 * Receptor de webhooks da Pluggy (Open Finance) — POST /api/webhooks/pluggy.
 *
 * Endpoint PÚBLICO (não passa por sessão): o proxy roda getSession em /api/*
 * mas só redireciona rotas de PROTECTED_ROUTES, e esta não está lá. A
 * autenticidade vem de um SHARED SECRET em header, não de sessão.
 *
 * Contrato Pluggy (confirmado na referência oficial + SDK, não suposição):
 * - A Pluggy NÃO assina o corpo. O modelo de auth é HEADER CUSTOMIZADO: ao criar
 *   o webhook define-se um header (aqui `Authorization: Bearer <token>`) que a
 *   Pluggy reenvia a cada notificação. O token é gerado pelo cliente e mora no
 *   env `PLUGGY_WEBHOOK_SECRET` + no campo `headers` do webhook na Pluggy.
 * - Payload top-level: `event`, `eventId`, `itemId`; `item/error` traz `error`;
 *   `transactions/created` traz `accountId`/`transactionsCount` (NÃO os ids —
 *   por isso o handler dispara o sync, que busca as transações, em vez de
 *   inserir direto).
 * - Precisa responder 2XX em < 5s; retry até 9x. O trabalho aqui é leve
 *   (1 GET item OU 1 sync), então processamos inline sem fila.
 *
 * Segurança/robustez:
 * - Token inválido/ausente → 401, sem tocar no banco.
 * - Flag OPENFINANCE_ENABLED off → 200 e ignora (não 404: não vaza topologia
 *   nem faz a Pluggy re-tentar 9x contra um endpoint que existe).
 * - Item desconhecido / evento não tratado → 200 e ignora (idempotente,
 *   futuro-prova; evita retries inúteis).
 * - Nunca loga corpo, token ou secret.
 */

function isOpenFinanceEnabled(): boolean {
	return process.env.OPENFINANCE_ENABLED?.trim().toLowerCase() === "true";
}

interface PluggyWebhookPayload {
	event?: string;
	eventId?: string;
	itemId?: string;
	accountId?: string;
	error?: { code?: string; message?: string };
}

export async function POST(request: Request) {
	// 1. Auth por shared secret no header Authorization. Rejeita ANTES de
	//    parsear/tocar no banco. 401 sem detalhe — não distingue "sem secret
	//    configurado" de "token errado" para não dar pista a quem sonda.
	const authorized = verifyPluggyWebhookToken(
		request.headers.get("Authorization"),
		process.env.PLUGGY_WEBHOOK_SECRET,
	);
	if (!authorized) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	// 2. Flag: token válido mas feature desligada → aceita e ignora.
	if (!isOpenFinanceEnabled()) {
		return NextResponse.json({ ok: true, ignored: "disabled" });
	}

	// 3. Parse. Corpo autenticado mas não-JSON é anômalo → 200 e ignora (não
	//    vale re-tentar 9x).
	let payload: PluggyWebhookPayload;
	try {
		payload = (await request.json()) as PluggyWebhookPayload;
	} catch {
		console.warn("[webhook/pluggy] corpo autenticado mas não-JSON — ignorado");
		return NextResponse.json({ ok: true, ignored: "unparseable" });
	}

	const { event, itemId } = payload;
	if (!event || !itemId) {
		return NextResponse.json({ ok: true, ignored: "missing-fields" });
	}

	// 4. Localiza a conexão pelo itemId. Webhook não tem userId — o itemId é a
	//    chave. Sem conexão local (item de outro ambiente/já desconectado) →
	//    ignora.
	const [connection] = await db
		.select({
			id: openFinanceConnections.id,
			pluggyItemId: openFinanceConnections.pluggyItemId,
		})
		.from(openFinanceConnections)
		.where(eq(openFinanceConnections.pluggyItemId, itemId));

	if (!connection) {
		return NextResponse.json({ ok: true, ignored: "unknown-item" });
	}

	// 5. Dispatch por evento. Tudo best-effort: um erro aqui NÃO deve virar 5xx
	//    (a Pluggy re-tentaria 9x). Envolve o trabalho e sempre responde 200.
	try {
		switch (event) {
			// Item degradado: consulta o estado real e grava status/consentimento —
			// mesma lógica do A2, só que disparada em tempo real. O badge (LOGIN_ERROR
			// destructive / OUTDATED warning) e o botão Reconectar refletem na hora.
			case "item/error":
			case "item/waiting_user_input":
			case "item/waiting_user_action":
				await refreshConnectionStatus(connection);
				break;

			// Item voltou a funcionar: reconsulta para limpar o status (o próprio
			// getItem devolverá UPDATED e refreshConnectionStatus grava).
			case "item/updated":
			case "item/login_succeeded":
				await refreshConnectionStatus(connection);
				break;

			// Transações novas/alteradas: puxa AGORA furando o throttle de 1h. O
			// payload não traz os ids (só accountId/count + um link), então o caminho
			// certo é o sync, que busca as transações e passa pelo dedup de 2 camadas.
			case "transactions/created":
			case "transactions/updated":
				await syncOpenFinanceConnection(connection.id, { force: true });
				break;

			default:
				// Evento não tratado (payments, connector/status_updated, etc.) —
				// aceita e ignora.
				return NextResponse.json({ ok: true, ignored: "unhandled-event" });
		}
	} catch (error) {
		// Loga sem PII e responde 200 mesmo assim: o webhook já foi recebido; um
		// 5xx só provocaria retries que repetiriam o mesmo erro.
		const err = error as Error;
		console.error("[webhook/pluggy] handler error", {
			connectionId: connection.id,
			event,
			name: err.name,
			message: err.message,
		});
		return NextResponse.json({ ok: true, handled: false });
	}

	return NextResponse.json({ ok: true, handled: true });
}
