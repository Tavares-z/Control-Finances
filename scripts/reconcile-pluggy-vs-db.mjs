#!/usr/bin/env node
// READ-ONLY: reconciliação DIRETA entre o que a Pluggy tem e o que está no nosso
// banco, por transação (via ofx_fit_id = id da Pluggy). Mostra, para um cartão:
//   - tx da Pluggy que NÃO estão no nosso banco (candidatas a bug de sync)
//   - para cada uma: date, amount, status, parcela, billId, billForecastDate
//   - e o período que a Pluggy sugere (billId→dueDate ou billForecastDate)
// Assim dá pra ver se o dado existe na fonte e não entrou (bug nosso) ou não existe.
//
// Uso: node scripts/reconcile-pluggy-vs-db.mjs <itemId> <cardIdLocal> --no-env-file

import { config } from "dotenv";
import pg from "pg";
const args = process.argv.slice(2);
if (!args.includes("--no-env-file")) config();
else console.log("(--no-env-file)");
const PLUGGY = "https://api.pluggy.ai";
const [itemId, cardIdLocal] = args.filter((a) => !a.startsWith("--"));
if (!itemId || !cardIdLocal) {
	console.error("Uso: node scripts/reconcile-pluggy-vs-db.mjs <itemId> <cardIdLocal> --no-env-file");
	process.exit(1);
}

async function auth() {
	const r = await fetch(`${PLUGGY}/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: process.env.PLUGGY_CLIENT_ID, clientSecret: process.env.PLUGGY_CLIENT_SECRET }), cache: "no-store" });
	if (!r.ok) { console.error(`/auth ${r.status}`); process.exit(1); }
	return (await r.json()).apiKey;
}
async function get(k, path) { const r = await fetch(`${PLUGGY}${path}`, { headers: { "X-API-KEY": k }, cache: "no-store" }); return { status: r.status, b: await r.json().catch(() => ({})) }; }

const k = await auth();
const accs = await get(k, `/accounts?itemId=${encodeURIComponent(itemId)}`);
const credit = (accs.b.results ?? []).find((a) => a.type === "CREDIT");
if (!credit) { console.error("sem CREDIT"); process.exit(1); }
const page = await get(k, `/v2/transactions?accountId=${credit.id}`);
const pluggyTxs = page.b.results ?? [];

// cache billId→dueDate
const billCache = new Map();
async function periodOf(t) {
	const m = t.creditCardMetadata ?? {};
	if (m.billId) {
		if (!billCache.has(m.billId)) {
			const bill = await get(k, `/bills/${m.billId}`);
			billCache.set(m.billId, (bill.b.dueDate ?? "").slice(0, 7));
		}
		return billCache.get(m.billId) || "?";
	}
	return (m.billForecastDate ?? "?").slice(0, 7);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
	const { rows } = await client.query(
		`select ofx_fit_id, periodo, valor, nome from lancamentos where cartao_id=$1 and ofx_fit_id is not null`, [cardIdLocal]);
	const dbByFit = new Map(rows.map((r) => [r.ofx_fit_id, r]));
	console.log(`\nPluggy: ${pluggyTxs.length} tx | nosso banco (com ofx_fit_id): ${rows.length} tx\n`);

	let missing = 0;
	console.log("═══ tx da PLUGGY que NÃO estão no nosso banco ═══");
	console.log("date       | amount | status | parc | períodoPluggy | id");
	for (const t of pluggyTxs) {
		if (dbByFit.has(t.id)) continue;
		missing++;
		const m = t.creditCardMetadata ?? {};
		const inst = m.installmentNumber != null ? `${m.installmentNumber}/${m.totalInstallments}` : "—";
		const per = await periodOf(t);
		console.log(`${(t.date ?? "").slice(0, 10)} | ${String(t.amount).padStart(8)} | ${(t.status ?? "").padEnd(7)} | ${inst.padEnd(5)} | ${per.padEnd(7)} | ${t.id.slice(0, 8)}`);
	}
	console.log(`\nTotal faltando no nosso banco: ${missing} de ${pluggyTxs.length}`);
} finally { await client.end(); }
console.log("\nNada gravado.");
