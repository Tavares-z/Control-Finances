#!/usr/bin/env node
// READ-ONLY: mostra o status do item e TODAS as accounts dele (id, type, subtype,
// nome), + contagem de tx por account CREDIT. Pra cravar se o item mudou de account
// (account nova sem tx) ou se está com problema de status/consentimento.
// NÃO imprime valor/saldo/titular.
//
// Uso: node scripts/probe-mp-item-status.mjs <itemId> --no-env-file

import { config } from "dotenv";
const args = process.argv.slice(2);
if (!args.includes("--no-env-file")) config();
else console.log("(--no-env-file)");

const PLUGGY_API_URL = "https://api.pluggy.ai";
const itemId = args.filter((a) => !a.startsWith("--"))[0];
if (!itemId) { console.error("Uso: node scripts/probe-mp-item-status.mjs <itemId> --no-env-file"); process.exit(1); }

async function auth() {
	const res = await fetch(`${PLUGGY_API_URL}/auth`, {
		method: "POST", headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ clientId: process.env.PLUGGY_CLIENT_ID, clientSecret: process.env.PLUGGY_CLIENT_SECRET }),
		cache: "no-store",
	});
	if (!res.ok) { console.error(`/auth HTTP ${res.status}`); process.exit(1); }
	return (await res.json()).apiKey;
}
async function get(apiKey, path) {
	const res = await fetch(`${PLUGGY_API_URL}${path}`, { headers: { "X-API-KEY": apiKey }, cache: "no-store" });
	if (!res.ok) return { __error: `HTTP ${res.status}` };
	return res.json();
}

const apiKey = await auth();

const item = await get(apiKey, `/items/${itemId}`);
if (item.__error) { console.error(`GET /items: ${item.__error}`); process.exit(1); }
console.log(`\n━━━ ITEM ${itemId} ━━━`);
console.log(`  connector: ${item.connector?.name ?? "?"} (id ${item.connector?.id ?? "?"})`);
console.log(`  status: ${item.status}  |  executionStatus: ${item.executionStatus ?? "?"}`);
console.log(`  lastUpdatedAt: ${item.lastUpdatedAt ?? "?"}`);
console.log(`  createdAt: ${item.createdAt ?? "?"}  updatedAt: ${item.updatedAt ?? "?"}`);
if (item.error) console.log(`  error: ${JSON.stringify(item.error)}`);
console.log(`  statusDetail: ${JSON.stringify(item.statusDetail, null, 2) ?? "null"}`);
if (item.executionReport) console.log(`  executionReport: ${JSON.stringify(item.executionReport, null, 2)}`);

const accs = await get(apiKey, `/accounts?itemId=${encodeURIComponent(itemId)}`);
const list = accs.results ?? [];
console.log(`\n━━━ ACCOUNTS (${list.length}) ━━━`);
for (const a of list) {
	console.log(`  ${a.type} / ${a.subtype ?? "—"} | id=${a.id} | name=${a.name ?? "—"}`);
	if (a.type === "CREDIT") {
		const tx = await get(apiKey, `/v2/transactions?accountId=${a.id}&pageSize=1`);
		console.log(`     tx total (total do endpoint): ${tx.total ?? "?"} | primeira página: ${(tx.results ?? []).length}`);
	}
}
console.log("\nPronto. Nada gravado.");
