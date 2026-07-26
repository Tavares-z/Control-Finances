#!/usr/bin/env node
// Sonda READ-ONLY para dimensionar a UI de vínculo (F1.1): para cada itemId
// passado por argumento, chama GET /accounts e imprime SÓ o shape agregado das
// contas BANK (após filtrar type !== "CREDIT").
//
// NÃO toca banco nenhum (nem kodama nem sakura). NÃO grava nada. NÃO chama
// /transactions. Só lê as credenciais Pluggy do .env e bate na API externa.
//
// PRIVACIDADE: imprime apenas type / subtype / name / marketingName (o RÓTULO
// do produto). NUNCA imprime number, balance, taxNumber, owner, nem qualquer
// valor monetário ou identificador de titular.
//
// Uso:
//   node scripts/probe-pluggy-accounts.mjs <itemId1> <itemId2> <itemId3> <itemId4>

import { config } from "dotenv";

config();

const PLUGGY_API_URL = "https://api.pluggy.ai";

const itemIds = process.argv.slice(2).filter(Boolean);
if (itemIds.length === 0) {
	console.error(
		"Uso: node scripts/probe-pluggy-accounts.mjs <itemId> [<itemId> ...]",
	);
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
// Não imprime nada além do nome do conector.
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
	// itemId parcialmente mascarado no output (não é segredo, mas evita colar cru).
	const masked = `${itemId.slice(0, 8)}…`;
	const connectorName = await getConnectorName(apiKey, itemId);
	console.log(`\n=== item ${masked} — banco: ${connectorName} ===`);

	if (env.error) {
		console.log(`  ERRO: ${env.error}`);
		continue;
	}

	const results = env.results ?? [];
	const bankAccounts = results.filter((a) => a.type !== "CREDIT");

	console.log(`  total de accounts no item: ${results.length}`);
	console.log(`  contas após filtro (type !== "CREDIT"): ${bankAccounts.length}`);
	for (const a of bankAccounts) {
		// SÓ rótulos — nada de number/balance/taxNumber/owner.
		console.log(
			`    - type=${a.type} subtype=${a.subtype ?? "null"} name=${JSON.stringify(a.name)} marketingName=${JSON.stringify(a.marketingName)}`,
		);
	}
	console.log(
		`  → ${bankAccounts.length === 1 ? "1 conta → COLAPSA para 1 nível" : `${bankAccounts.length} contas → 2 níveis`}`,
	);
}

console.log("\nPronto. Nenhum dado gravado, nenhum banco tocado.");
