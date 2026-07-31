#!/usr/bin/env node
// Sonda READ-ONLY para o gate de viabilidade da FASE 2 (Open Finance p/ cartões):
// para cada itemId passado por argumento, chama GET /accounts e imprime o shape
// de TODAS as contas, destacando as de type === "CREDIT" (cartão) — o oposto do
// probe-pluggy-accounts.mjs (F1), que filtra o CREDIT fora.
//
// A pergunta que este script responde: "a Pluggy expõe o cartão desejado como
// uma account type=CREDIT neste item?" Se sim, a Fase 2 tem o que vincular.
//
// NÃO toca banco nenhum. NÃO grava nada. NÃO chama /transactions. Só lê as
// credenciais Pluggy do .env e bate na API externa.
//
// PRIVACIDADE: imprime apenas type / subtype / name / marketingName (o RÓTULO
// do produto). NUNCA imprime number, balance, creditData, taxNumber, owner, nem
// qualquer valor monetário ou identificador de titular.
//
// Uso:
//   node scripts/probe-pluggy-credit.mjs <itemId1> [<itemId2> ...]

import { config } from "dotenv";

config();

const PLUGGY_API_URL = "https://api.pluggy.ai";

const itemIds = process.argv.slice(2).filter(Boolean);
if (itemIds.length === 0) {
	console.error("Uso: node scripts/probe-pluggy-credit.mjs <itemId> [<itemId> ...]");
	process.exit(1);
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

async function listAccounts(apiKey, itemId) {
	const res = await fetch(
		`${PLUGGY_API_URL}/accounts?itemId=${encodeURIComponent(itemId)}`,
		{ method: "GET", headers: { "X-API-KEY": apiKey }, cache: "no-store" },
	);
	if (!res.ok) {
		return { error: `HTTP ${res.status}` };
	}
	return res.json();
}

// GET /items/{id} só para extrair connector.name (rótulo do banco). Read-only.
async function getConnectorName(apiKey, itemId) {
	const res = await fetch(
		`${PLUGGY_API_URL}/items/${encodeURIComponent(itemId)}`,
		{ method: "GET", headers: { "X-API-KEY": apiKey }, cache: "no-store" },
	);
	if (!res.ok) {
		return `(connector desconhecido — HTTP ${res.status})`;
	}
	const item = await res.json();
	return item?.connector?.name ?? "(sem connector.name)";
}

const apiKey = await authenticate();

for (const itemId of itemIds) {
	const env = await listAccounts(apiKey, itemId);
	const masked = `${itemId.slice(0, 8)}…`;
	const connectorName = await getConnectorName(apiKey, itemId);
	console.log(`\n=== item ${masked} — banco: ${connectorName} ===`);

	if (env.error) {
		console.log(`  ERRO: ${env.error}`);
		continue;
	}

	const results = env.results ?? [];
	const credit = results.filter((a) => a.type === "CREDIT");
	const bank = results.filter((a) => a.type !== "CREDIT");

	console.log(`  total de accounts no item: ${results.length}`);
	console.log(`  → CARTÕES (type === "CREDIT"): ${credit.length}`);
	for (const a of credit) {
		// SÓ rótulos — nunca number/balance/creditData/taxNumber/owner.
		console.log(
			`    - type=${a.type} subtype=${a.subtype ?? "null"} name=${JSON.stringify(a.name)} marketingName=${JSON.stringify(a.marketingName)}`,
		);
	}
	console.log(`  → contas bancárias (outros types): ${bank.length}`);
	for (const a of bank) {
		console.log(
			`    - type=${a.type} subtype=${a.subtype ?? "null"} name=${JSON.stringify(a.name)} marketingName=${JSON.stringify(a.marketingName)}`,
		);
	}

	console.log(
		credit.length > 0
			? `  ✅ VIÁVEL: ${credit.length} cartão(ões) exposto(s) como CREDIT — a Fase 2 tem o que vincular.`
			: `  ❌ Nenhuma account CREDIT neste item — este banco/conexão NÃO expõe cartão pela Pluggy.`,
	);
}

console.log("\nPronto. Nenhum dado gravado, nenhum banco tocado.");
