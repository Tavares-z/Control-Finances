import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { openFinanceConnections } from "@/db/schema";
import { verifyPluggyWebhookSignature } from "@/features/openfinance/lib/pluggy-client";
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
 * autenticidade vem da assinatura HMAC-SHA512 do corpo, não de sessão.
 *
 * Contrato Pluggy (confirmado na doc, não suposição):
 * - Header `X-HMAC-SHA512-Signature` = base64(HMAC-SHA512(corpo cru)).
 * - Secrets CURRENT/NEXT rotacionáveis (env PLUGGY_WEBHOOK_SECRET[_NEXT]).
 * - Payload top-level: `event`, `eventId`, `itemId`; `item/error` traz `error`;
 *   `transactions/created` traz `accountId`/`transactionsCount` (NÃO os ids —
 *   por isso o handler dispara o sync, que busca as transações, em vez de
 *   inserir direto).
 * - Precisa responder 2XX em < 5s; retry até 9x. O trabalho aqui é leve
 *   (1 GET item OU 1 sync), então processamos inline sem fila.
 *
 * Segurança/robustez:
 * - Assinatura inválida → 401, sem tocar no banco.
 * - Flag OPENFINANCE_ENABLED off → 200 e ignora (não 404: não vaza topologia
 *   nem faz a Pluggy re-tentar 9x contra um endpoint que existe).
 * - Item desconhecido / evento não tratado → 200 e ignora (idempotente,
 *   futuro-prova; evita retries inúteis).
 * - Nunca loga corpo, assinatura ou secret.
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
	// 1. Corpo CRU primeiro — a validação HMAC é sobre os bytes recebidos, não
	//    sobre JSON re-serializado. Reparsear depois de validar.
	const rawBody = await request.text();

	// 2. Assinatura. Rejeita ANTES de parsear/tocar no banco.
	const signature = request.headers.get("X-HMAC-SHA512-Signature");
	const valid = verifyPluggyWebhookSignature(rawBody, signature, {
		current: process.env.PLUGGY_WEBHOOK_SECRET,
		next: process.env.PLUGGY_WEBHOOK_SECRET_NEXT,
	});
	if (!valid) {
		// 401 sem detalhe — não distingue "sem secret configurado" de "assinatura
		// errada" para não dar pista a quem sonda o endpoint.
		return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
	}

	// 3. Flag: assinatura válida mas feature desligada → aceita e ignora.
	if (!isOpenFinanceEnabled()) {
		return NextResponse.json({ ok: true, ignored: "disabled" });
	}

	// 4. Parse. Corpo válido por assinatura mas não-JSON é anômalo → 200 e ignora
	//    (não vale re-tentar 9x).
	let payload: PluggyWebhookPayload;
	try {
		payload = JSON.parse(rawBody) as PluggyWebhookPayload;
	} catch {
		console.warn("[webhook/pluggy] corpo assinado mas não-JSON — ignorado");
		return NextResponse.json({ ok: true, ignored: "unparseable" });
	}

	const { event, itemId } = payload;
	if (!event || !itemId) {
		return NextResponse.json({ ok: true, ignored: "missing-fields" });
	}

	// 5. Localiza a conexão pelo itemId. Webhook não tem userId — o itemId é a
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

	// 6. Dispatch por evento. Tudo best-effort: um erro aqui NÃO deve virar 5xx
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
