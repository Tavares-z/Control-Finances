#!/usr/bin/env node
// READ-ONLY: lista as transações de CRÉDITO (amount < 0) de uma account CREDIT
// no período, mostrando nome, status, billId (→dueDate) e parcela. Serve pra
// entender o que são os créditos que abateram a fatura (estorno? pagamento?
// reprocessamento de parcelamento?). Mostra descrição e SINAL, não valor absoluto.
//
// Uso: node scripts/probe-pluggy-credits.mjs <itemId> --days=90 --no-env-file

import { config } from "dotenv";

const args = process.argv.slice(2);
if (!args.includes("--no-env-file")) config();

const PLUGGY_API_URL = "https://api.pluggy.ai";
const daysArg = args.find((a) => a.startsWith("--days="));
const DAYS = daysArg ? Number.parseInt(daysArg.split("=")[1], 10) || 90 : 90;
const itemId = args.filter((a) => !a.startsWith("--"))[0];
if (!itemId) {
	console.error("Uso: node scripts/probe-pluggy-credits.mjs <itemId> --days=90 --no-env-file");
	process.exit(1);
}

async function auth() {
	const res = await fetch(`${PLUGGY_API_URL}/auth`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			clientId: process.env.PLUGGY_CLIENT_ID,
			clientSecret: process.env.PLUGGY_CLIENT_SECRET,
		}),
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
const txs = page.results ?? [];

// Só os créditos (amount < 0 na convenção de cartão da Pluggy = pagamento/estorno).
const credits = txs.filter((t) => t.amount < 0);
console.log(`\ncartão ${credit.id.slice(0,8)}… — ${credits.length} crédito(s) (amount<0) de ${txs.length} tx:\n`);
console.log("date       | status  | parcela | billId  | descrição");
for (const t of credits.sort((a,b)=>(b.date??"").localeCompare(a.date??""))) {
	const m = t.creditCardMetadata ?? {};
	const inst = m.installmentNumber != null && m.totalInstallments != null ? `${m.installmentNumber}/${m.totalInstallments}` : "—";
	const bill = m.billId ? String(m.billId).slice(0,8)+"…" : "—";
	console.log(`${(t.date??"").slice(0,10)} | ${String(t.status).padEnd(7)} | ${inst.padEnd(7)} | ${bill} | ${t.description ?? "(sem descr)"}`);
}
console.log("\n(amount<0 = crédito na convenção de cartão da Pluggy: pagamento OU estorno)");
