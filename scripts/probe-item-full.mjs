#!/usr/bin/env node
// READ-ONLY: despeja o JSON CRU COMPLETO do item e de cada account, pra caçar
// QUALQUER warning de rate limit (TXN_003 / 423 / INV_004) ou isUpdated:false que
// possa estar aninhado onde uma leitura de campo pontual não vê. Também bate o
// endpoint /v2/transactions e imprime o `total` real + headers de rate limit.
// NÃO imprime valor/saldo/titular das transações (só metadados de status).
//
// Uso: node scripts/probe-item-full.mjs <itemId> --no-env-file

import { config } from "dotenv";
const args = process.argv.slice(2);
if (!args.includes("--no-env-file")) config();
else console.log("(--no-env-file)");

const PLUGGY_API_URL = "https://api.pluggy.ai";
const itemId = args.filter((a) => !a.startsWith("--"))[0];
if (!itemId) { console.error("Uso: node scripts/probe-item-full.mjs <itemId> --no-env-file"); process.exit(1); }

async function auth() {
	const res = await fetch(`${PLUGGY_API_URL}/auth`, {
		method: "POST", headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ clientId: process.env.PLUGGY_CLIENT_ID, clientSecret: process.env.PLUGGY_CLIENT_SECRET }),
		cache: "no-store",
	});
	if (!res.ok) { console.error(`/auth HTTP ${res.status}`); process.exit(1); }
	return (await res.json()).apiKey;
}
async function getRaw(apiKey, path) {
	const res = await fetch(`${PLUGGY_API_URL}${path}`, { headers: { "X-API-KEY": apiKey }, cache: "no-store" });
	// captura headers de rate limit, se houver
	const rl = {};
	for (const [k, v] of res.headers.entries()) {
		if (k.toLowerCase().includes("rate") || k.toLowerCase().includes("limit") || k.toLowerCase().includes("remaining")) rl[k] = v;
	}
	let body = null;
	try { body = await res.json(); } catch { body = { __nonjson: true }; }
	return { status: res.status, rl, body };
}

const apiKey = await auth();

console.log(`\n════════ ITEM ${itemId} (JSON CRU) ════════`);
const item = await getRaw(apiKey, `/items/${itemId}`);
console.log(`HTTP ${item.status}`);
if (Object.keys(item.rl).length) console.log(`rate-limit headers: ${JSON.stringify(item.rl)}`);
console.log(JSON.stringify(item.body, null, 2));

console.log(`\n════════ ACCOUNTS (JSON CRU) ════════`);
const accs = await getRaw(apiKey, `/accounts?itemId=${encodeURIComponent(itemId)}`);
console.log(JSON.stringify(accs.body, null, 2));

// Pra cada CREDIT, bate /v2/transactions e mostra total + rate headers
for (const a of accs.body.results ?? []) {
	if (a.type !== "CREDIT") continue;
	console.log(`\n════════ /v2/transactions CREDIT ${a.id} ════════`);
	const tx = await getRaw(apiKey, `/v2/transactions?accountId=${a.id}`);
	console.log(`HTTP ${tx.status}`);
	if (Object.keys(tx.rl).length) console.log(`rate-limit headers: ${JSON.stringify(tx.rl)}`);
	console.log(`total=${tx.body.total ?? "?"} totalPages=${tx.body.totalPages ?? "?"} results=${(tx.body.results ?? []).length}`);
	if (tx.body.message || tx.body.code || tx.body.error) {
		console.log(`corpo (msg/code/error): ${JSON.stringify({ message: tx.body.message, code: tx.body.code, error: tx.body.error })}`);
	}
}
console.log("\nPronto. Nada gravado. Procure: TXN_003, 423, INV_004, isUpdated:false, PARTIAL_SUCCESS.");
