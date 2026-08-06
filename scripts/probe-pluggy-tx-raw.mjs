#!/usr/bin/env node
// READ-ONLY: despeja o JSON CRU e COMPLETO de uma ou mais transações da Pluggy,
// buscando por account + filtrando por id. Objetivo: ver TODOS os campos que a API
// devolve (inclusive os que nosso client ignora) pra descobrir se a Pluggy sinaliza
// cancelamento/estorno em algum campo não modelado. É seu dado — imprime tudo.
//
// Uso: node scripts/probe-pluggy-tx-raw.mjs <itemId> --ids=id1,id2 --days=200 --no-env-file

import { config } from "dotenv";

const args = process.argv.slice(2);
if (!args.includes("--no-env-file")) config();
const PLUGGY_API_URL = "https://api.pluggy.ai";
function arg(n) { const h = args.find((a) => a.startsWith(`--${n}=`)); return h ? h.split("=").slice(1).join("=") : undefined; }
const itemId = args.filter((a) => !a.startsWith("--"))[0];
const ids = (arg("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const DAYS = arg("days") ? Number.parseInt(arg("days"), 10) : 200;
if (!itemId || ids.length === 0) { console.error("Uso: node scripts/probe-pluggy-tx-raw.mjs <itemId> --ids=id1,id2 --no-env-file"); process.exit(1); }

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
	if (!res.ok) return { error: `HTTP ${res.status}` };
	return res.json();
}

const apiKey = await auth();

// 1) Tenta o endpoint direto de transação por id (mais completo, se existir).
for (const id of ids) {
	const direct = await get(apiKey, `/transactions/${encodeURIComponent(id)}`);
	if (!direct.error) {
		console.log(`\n===== GET /transactions/${id} (direto) =====`);
		console.log(JSON.stringify(direct, null, 2));
	} else {
		console.log(`\n(GET /transactions/${id} → ${direct.error}; caio no list)`);
	}
}

// 2) Fallback: pega do list e filtra por id (garante ver o shape do list também).
const accs = await get(apiKey, `/accounts?itemId=${encodeURIComponent(itemId)}`);
const credit = (accs.results ?? []).find((a) => a.type === "CREDIT");
if (credit) {
	const from = new Date(Date.now() - DAYS * 86400000).toISOString().slice(0, 10);
	const page = await get(apiKey, `/v2/transactions?accountId=${credit.id}&createdAtFrom=${from}`);
	const found = (page.results ?? []).filter((t) => ids.includes(t.id));
	for (const t of found) {
		console.log(`\n===== do /v2/transactions (list) id=${t.id} =====`);
		console.log(JSON.stringify(t, null, 2));
	}
}
console.log("\nPronto. Nada gravado.");
