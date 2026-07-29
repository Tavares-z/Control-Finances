#!/usr/bin/env node
// Registra (ou atualiza) o webhook da aplicação Pluggy com o header de
// autenticação `Authorization: Bearer <PLUGGY_WEBHOOK_SECRET>`.
//
// Necessário porque headers de webhook SÓ podem ser configurados via API — o
// dashboard da Pluggy não expõe o campo `headers` (decisão deles: evitar expor
// segredo na UI). Este script é o único caminho para pôr o secret no webhook.
//
// Lê tudo do .env (mesma convenção de probe-pluggy-accounts.mjs):
//   - PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET → autentica na API.
//   - PLUGGY_WEBHOOK_SECRET → vira o Bearer token do header (o MESMO valor que
//     o receptor /api/webhooks/pluggy compara). NUNCA é impresso.
//   - BETTER_AUTH_URL → base da URL do webhook (/api/webhooks/pluggy), a menos
//     que uma URL seja passada por argumento.
//
// Idempotente: se já existe um webhook com a MESMA url, faz PATCH (atualiza
// event/headers) em vez de criar outro. Escolhe `event = "all"`.
//
// Uso:
//   node scripts/register-pluggy-webhook.mjs [urlCompletaDoWebhook]
//   (sem argumento, monta de BETTER_AUTH_URL)
//
// NÃO toca banco nenhum. Só bate na API Pluggy.

import { config } from "dotenv";

config();

const PLUGGY_API_URL = "https://api.pluggy.ai";
const WEBHOOK_PATH = "/api/webhooks/pluggy";
const EVENT = "all";

function resolveWebhookUrl() {
	// 1) argumento explícito ganha.
	const arg = process.argv[2]?.trim();
	if (arg) return arg;

	// 2) senão monta de BETTER_AUTH_URL (mesma regra da action: exige HTTPS
	//    pública — localhost/HTTP não serve para webhook).
	const base = process.env.BETTER_AUTH_URL?.trim();
	if (!base) {
		console.error(
			"BETTER_AUTH_URL ausente e nenhuma URL passada por argumento.\n" +
				"Uso: node scripts/register-pluggy-webhook.mjs https://seu-dominio/api/webhooks/pluggy",
		);
		process.exit(1);
	}
	let url;
	try {
		url = new URL(base);
	} catch {
		console.error(`BETTER_AUTH_URL inválida: ${base}`);
		process.exit(1);
	}
	if (url.protocol !== "https:") {
		console.error(
			`BETTER_AUTH_URL não é HTTPS (${base}). A Pluggy exige HTTPS pública; ` +
				"passe a URL de staging/prod por argumento.",
		);
		process.exit(1);
	}
	if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
		console.error(
			"BETTER_AUTH_URL é localhost — a Pluggy proíbe. Passe a URL pública por argumento.",
		);
		process.exit(1);
	}
	return new URL(WEBHOOK_PATH, url).toString();
}

async function authenticate() {
	const clientId = process.env.PLUGGY_CLIENT_ID;
	const clientSecret = process.env.PLUGGY_CLIENT_SECRET;
	if (!clientId || !clientSecret) {
		console.error("PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET ausentes no .env.");
		process.exit(1);
	}
	const res = await fetch(`${PLUGGY_API_URL}/auth`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ clientId, clientSecret }),
		cache: "no-store",
	});
	if (!res.ok) {
		console.error(`Falha no /auth: HTTP ${res.status}`);
		process.exit(1);
	}
	const { apiKey } = await res.json();
	return apiKey;
}

async function listWebhooks(apiKey) {
	const res = await fetch(`${PLUGGY_API_URL}/webhooks`, {
		method: "GET",
		headers: { "X-API-KEY": apiKey },
		cache: "no-store",
	});
	if (!res.ok) {
		console.error(`Falha ao listar webhooks: HTTP ${res.status}`);
		process.exit(1);
	}
	const body = await res.json();
	// A API pagina em { results } ou devolve array direto — tolera os dois.
	return Array.isArray(body) ? body : (body.results ?? []);
}

async function createWebhook(apiKey, url, headers) {
	const res = await fetch(`${PLUGGY_API_URL}/webhooks`, {
		method: "POST",
		headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
		body: JSON.stringify({ url, event: EVENT, headers }),
		cache: "no-store",
	});
	if (!res.ok) {
		console.error(`Falha ao criar webhook: HTTP ${res.status}`);
		const text = await res.text().catch(() => "");
		if (text) console.error(text);
		process.exit(1);
	}
	return res.json();
}

async function updateWebhook(apiKey, id, headers) {
	const res = await fetch(
		`${PLUGGY_API_URL}/webhooks/${encodeURIComponent(id)}`,
		{
			method: "PATCH",
			headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
			// SÓ headers (+ enabled): reenviar url/event iguais faz a Pluggy tratar
			// como recriação e bater na unicidade (url+event) → HTTP 400. O PATCH
			// altera só o que muda.
			body: JSON.stringify({ headers, enabled: true }),
			cache: "no-store",
		},
	);
	if (!res.ok) {
		console.error(`Falha ao atualizar webhook: HTTP ${res.status}`);
		const text = await res.text().catch(() => "");
		if (text) console.error(text);
		process.exit(1);
	}
	return res.json();
}

const webhookSecret = process.env.PLUGGY_WEBHOOK_SECRET?.trim();
if (!webhookSecret) {
	console.error(
		"PLUGGY_WEBHOOK_SECRET ausente no .env. Gere um token (openssl rand -hex 32) " +
			"e coloque em PLUGGY_WEBHOOK_SECRET antes de rodar.",
	);
	process.exit(1);
}

const webhookUrl = resolveWebhookUrl();
// O header que a Pluggy reenviará a cada notificação. O receptor compara o
// Bearer com PLUGGY_WEBHOOK_SECRET. NUNCA imprimimos o valor.
const headers = { Authorization: `Bearer ${webhookSecret}` };

const apiKey = await authenticate();

console.log(`Alvo do webhook: ${webhookUrl}`);
console.log(`Evento: ${EVENT}`);
console.log("Header Authorization: Bearer <secret oculto>");

const existing = await listWebhooks(apiKey);

// Diagnóstico: imprime as CHAVES de cada webhook (nunca valores — headers podem
// conter secret). Revela o nome real do campo de id se ele não for `id`.
console.log(`\n${existing.length} webhook(s) na aplicação. Chaves de cada um:`);
for (const w of existing) {
	console.log(`  - keys: [${Object.keys(w).join(", ")}]  url=${w.url}`);
}

const match = existing.find((w) => w.url === webhookUrl);
// Tolera nomes alternativos de id conforme o shape real observado acima.
const matchId = match?.id ?? match?.webhookId ?? match?._id;

let result;
if (match && matchId) {
	console.log(`\nJá existe um webhook para essa URL (id ${matchId}) → PATCH.`);
	result = await updateWebhook(apiKey, matchId, headers);
} else if (match && !matchId) {
	console.error(
		"\nWebhook existe mas não achei o id no shape retornado — ver as keys acima.",
	);
	process.exit(1);
} else {
	console.log("\nNenhum webhook para essa URL → POST (criando).");
	result = await createWebhook(apiKey, webhookUrl, headers);
}

// Imprime só campos não-sensíveis do resultado (nunca os headers).
console.log("\n✅ Webhook registrado:");
console.log(`   id:        ${result.id}`);
console.log(`   url:       ${result.url}`);
console.log(`   event:     ${result.event}`);
console.log(`   createdAt: ${result.createdAt ?? "—"}`);
console.log(`   updatedAt: ${result.updatedAt ?? "—"}`);
console.log(
	"\nHeaders NÃO são retornados pela API (a Pluggy não os expõe). " +
		"Confie no 200 e valide disparando um evento.",
);
