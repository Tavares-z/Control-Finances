#!/usr/bin/env node
// READ-ONLY: busca transações de uma account CREDIT cuja descrição casa um termo
// e imprime TODOS os campos úteis pra entender natureza (status, operationType,
// amount COM sinal, parcela, billForecast). É SEU dado — imprime valores.
//
// Uso: node scripts/probe-pluggy-tx-detail.mjs <itemId> --match=ASUS --days=120 --no-env-file

import { config } from "dotenv";

const args = process.argv.slice(2);
if (!args.includes("--no-env-file")) config();

const PLUGGY_API_URL = "https://api.pluggy.ai";
function arg(n) { const h = args.find((a) => a.startsWith(`--${n}=`)); return h ? h.split("=").slice(1).join("=") : undefined; }
const itemId = args.filter((a) => !a.startsWith("--"))[0];
const match = (arg("match") ?? "").toLowerCase();
const DAYS = arg("days") ? Number.parseInt(arg("days"), 10) : 120;
if (!itemId || !match) { console.error("Uso: node scripts/probe-pluggy-tx-detail.mjs <itemId> --match=TERMO --days=120 --no-env-file"); process.exit(1); }

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
const page = await get(apiKey, `/v2/transactions?accountId=${credit.id}&createdAtFrom=${from}`);
const txs = (page.results ?? []).filter((t) => (t.description ?? "").toLowerCase().includes(match) || (t.descriptionRaw ?? "").toLowerCase().includes(match));

console.log(`\n${txs.length} transação(ões) casando "${match}":\n`);
for (const t of txs.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))) {
	const m = t.creditCardMetadata ?? {};
	const inst = m.installmentNumber != null && m.totalInstallments != null ? `${m.installmentNumber}/${m.totalInstallments}` : "—";
	console.log(`─ ${t.description}`);
	console.log(`   amount=${t.amount}  status=${t.status}  type=${t.type}`);
	console.log(`   operationType=${t.operationType ?? "null"}  addInfo=${t.operationTypeAdditionalInfo ?? "null"}`);
	console.log(`   date=${t.date}  parcela=${inst}  billId=${m.billId ? m.billId.slice(0,8)+"…" : "—"}  billForecast=${m.billForecastDate ?? "—"}`);
	console.log(`   createdAt=${t.createdAt ?? "null"}  updatedAt=${t.updatedAt ?? "null"}`);
	console.log(`   category=${t.category ?? "null"}  descriptionRaw=${t.descriptionRaw ?? "null"}  id=${t.id}`);
	console.log("");
}
console.log("Pronto. Nada gravado.");
