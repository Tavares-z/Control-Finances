#!/usr/bin/env node
// READ-ONLY: lista TODAS as transações da account CREDIT de um item (uma página do
// /v2/transactions com createdAtFrom=hoje−DAYS), ordenadas por date, mostrando
// date | amount | status | parcela | descrição. É pra achar visualmente compras
// específicas por VALOR (ex: 16,01 e 13,03) e cravar se a Pluggy TEM ou não o dado.
// Também imprime o `next` (se houver mais páginas) e o total.
//
// Uso: node scripts/probe-pluggy-mp-listall.mjs <itemId> --days=120 --no-env-file

import { config } from "dotenv";
const args = process.argv.slice(2);
if (!args.includes("--no-env-file")) config();
else console.log("(--no-env-file)");

const PLUGGY_API_URL = "https://api.pluggy.ai";
function arg(n) { const h = args.find((a) => a.startsWith(`--${n}=`)); return h ? h.split("=").slice(1).join("=") : undefined; }
const itemId = args.filter((a) => !a.startsWith("--"))[0];
const DAYS = arg("days") ? Number.parseInt(arg("days"), 10) : 120;
if (!itemId) { console.error("Uso: node scripts/probe-pluggy-mp-listall.mjs <itemId> --days=120 --no-env-file"); process.exit(1); }

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
const accs = await get(apiKey, `/accounts?itemId=${encodeURIComponent(itemId)}`);
const credit = (accs.results ?? []).find((a) => a.type === "CREDIT");
if (!credit) { console.error("sem account CREDIT"); process.exit(1); }

const from = new Date(Date.now() - DAYS * 86400000).toISOString().slice(0, 10);
// pageSize alto pra tentar trazer tudo numa página; ainda imprime o next.
const page = await get(apiKey, `/v2/transactions?accountId=${credit.id}&createdAtFrom=${from}`);
const txs = (page.results ?? []).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

console.log(`\naccount CREDIT ${credit.id.slice(0,8)}… | createdAtFrom=${from} | ${txs.length} tx | next=${JSON.stringify(page.next)}\n`);
console.log("date       | createdAt   |    amount | status   | parc  | descrição");
for (const t of txs) {
	const m = t.creditCardMetadata ?? {};
	const inst = m.installmentNumber != null && m.totalInstallments != null ? `${m.installmentNumber}/${m.totalInstallments}` : "—";
	const d = (t.date ?? "").slice(0, 10);
	const c = (t.createdAt ?? "").slice(0, 10);
	console.log(`${d} | ${c.padEnd(10)} | ${String(t.amount).padStart(9)} | ${String(t.status ?? "").padEnd(8)} | ${inst.padEnd(5)} | ${t.description ?? ""}`);
}
console.log("\nProcure as compras pelo VALOR (amount). Nada gravado.");
