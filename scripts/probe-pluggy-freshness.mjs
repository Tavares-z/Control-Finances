#!/usr/bin/env node
// SONDA READ-ONLY: mede a "frescura" dos dados que a Pluggy tem para cada item
// de cartão. Imprime, por item, o MAIOR createdAt (quando a Pluggy inseriu a tx
// mais recente) e a contagem total. Rodando isto em momentos diferentes (agora e
// daqui a algumas horas/amanhã) dá pra ver se o MeuPluggy avança sozinho — e com
// que cadência. Responde "o OF de fatura é viável?" com dado, não achismo.
//
// NÃO imprime valor/descrição. Uso:
//   node scripts/probe-pluggy-freshness.mjs --no-env-file
// (precisa de PLUGGY_CLIENT_ID/SECRET e DATABASE_URL de prod na sessão)

import { config } from "dotenv";
import pg from "pg";

if (!process.argv.includes("--no-env-file")) config();
else console.log("(--no-env-file: usando só variáveis da sessão)");

const PLUGGY_API_URL = "https://api.pluggy.ai";

async function authenticate() {
	const res = await fetch(`${PLUGGY_API_URL}/auth`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			clientId: process.env.PLUGGY_CLIENT_ID,
			clientSecret: process.env.PLUGGY_CLIENT_SECRET,
		}),
		cache: "no-store",
	});
	if (!res.ok) {
		console.error(`Falha no /auth: HTTP ${res.status}`);
		process.exit(1);
	}
	return (await res.json()).apiKey;
}

async function creditAccountId(apiKey, itemId) {
	const res = await fetch(
		`${PLUGGY_API_URL}/accounts?itemId=${encodeURIComponent(itemId)}`,
		{ headers: { "X-API-KEY": apiKey }, cache: "no-store" },
	);
	const body = await res.json();
	return (body.results ?? []).find((a) => a.type === "CREDIT")?.id ?? null;
}

async function txStats(apiKey, accountId) {
	const q = new URLSearchParams({ accountId });
	const res = await fetch(`${PLUGGY_API_URL}/v2/transactions?${q.toString()}`, {
		headers: { "X-API-KEY": apiKey },
		cache: "no-store",
	});
	if (!res.ok) return { count: 0, maxCreated: null, maxDate: null };
	const body = await res.json();
	const txs = body.results ?? [];
	const created = txs.map((t) => t.createdAt).filter(Boolean).sort();
	const dates = txs.map((t) => t.date).filter(Boolean).sort();
	return {
		count: txs.length,
		maxCreated: created[created.length - 1] ?? null,
		maxDate: dates[dates.length - 1] ?? null,
	};
}

// Pega os itens de cartão do banco (nome + pluggy_item_id).
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
let items;
try {
	const { rows } = await client.query(
		`select c.apelido, c.pluggy_item_id, ca.nome
		   from openfinance_connections c
		   join cartoes ca on ca.id = c.cartao_id
		  order by c.apelido`,
	);
	items = rows;
} finally {
	await client.end();
}

const apiKey = await authenticate();
console.log(`\nMedição em: ${new Date().toISOString()}\n`);
console.log("cartão      | tx | createdAt mais recente     | date mais recente");
for (const it of items) {
	const accountId = await creditAccountId(apiKey, it.pluggy_item_id);
	if (!accountId) {
		console.log(`${(it.apelido ?? it.nome).padEnd(11)} | (sem account CREDIT)`);
		continue;
	}
	const s = await txStats(apiKey, accountId);
	console.log(
		`${(it.apelido ?? it.nome).padEnd(11)} | ${String(s.count).padStart(3)} | ${(s.maxCreated ?? "—").padEnd(26)} | ${s.maxDate ?? "—"}`,
	);
}
console.log(
	"\nRode de novo daqui a algumas horas: se 'createdAt mais recente' avançar,\n" +
		"o MeuPluggy sincronizou sozinho nesse intervalo (mede a cadência real).",
);
