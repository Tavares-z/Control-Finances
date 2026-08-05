#!/usr/bin/env node
// DIAGNÓSTICO READ-ONLY: por que Nubank/Mercado Pago não puxaram?
// Lista TODAS as conexões OF do banco alvo + o que cada uma tem vinculado, e
// para cada item sonda a Pluggy (GET /accounts) mostrando SÓ rótulos (type/name).
// Nunca grava nada. Nunca imprime número/saldo/titular.
//
// Uso (PROD): node diagnose-connections.mjs --no-env-file
// (a DATABASE_URL/credenciais Pluggy vêm da sessão; --no-env-file evita o .env de staging)

import { config } from "dotenv";
import pg from "pg";

if (!process.argv.includes("--no-env-file")) {
	config();
} else {
	console.log("(--no-env-file: usando DATABASE_URL/credenciais da sessão)");
}

const PLUGGY_API_URL = "https://api.pluggy.ai";
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error("DATABASE_URL ausente.");
	process.exit(1);
}

let host = "(desconhecido)";
try {
	host = new URL(DATABASE_URL).host;
} catch {}
console.log(`Banco alvo (host): ${host}\n`);

async function authenticate() {
	const clientId = process.env.PLUGGY_CLIENT_ID;
	const clientSecret = process.env.PLUGGY_CLIENT_SECRET;
	if (!clientId || !clientSecret) {
		console.error("PLUGGY_CLIENT_ID/SECRET ausentes — não vou sondar a Pluggy.");
		return null;
	}
	const res = await fetch(`${PLUGGY_API_URL}/auth`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ clientId, clientSecret }),
		cache: "no-store",
	});
	if (!res.ok) {
		console.error(`Falha no /auth Pluggy: HTTP ${res.status}`);
		return null;
	}
	const { apiKey } = await res.json();
	return apiKey;
}

async function getItem(apiKey, itemId) {
	const res = await fetch(`${PLUGGY_API_URL}/items/${encodeURIComponent(itemId)}`, {
		method: "GET",
		headers: { "X-API-KEY": apiKey },
		cache: "no-store",
	});
	if (!res.ok) return { error: `HTTP ${res.status}` };
	return res.json();
}

async function listAccounts(apiKey, itemId) {
	const res = await fetch(
		`${PLUGGY_API_URL}/accounts?itemId=${encodeURIComponent(itemId)}`,
		{ method: "GET", headers: { "X-API-KEY": apiKey }, cache: "no-store" },
	);
	if (!res.ok) return { error: `HTTP ${res.status}` };
	return res.json();
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

let rows;
try {
	({ rows } = await client.query(
		`select c.id, c.apelido, c.connector_name, c.pluggy_item_id,
		        c.conta_id, c.cartao_id, c.pluggy_account_id, c.status,
		        c.last_synced_at,
		        fa.nome as conta_nome, ca.nome as cartao_nome
		   from openfinance_connections c
		   left join contas fa on fa.id = c.conta_id
		   left join cartoes ca on ca.id = c.cartao_id
		  order by c.created_at`,
	));
} finally {
	await client.end();
}

console.log(`Total de conexões: ${rows.length}\n`);

const apiKey = await authenticate();

for (const r of rows) {
	const nome = r.apelido ?? r.connector_name ?? "(sem nome)";
	const vinculo = r.cartao_id
		? `CARTÃO → "${r.cartao_nome}"`
		: r.conta_id
			? `CONTA → "${r.conta_nome}"`
			: "NÃO VINCULADA";
	console.log(`━━━ ${nome} ━━━`);
	console.log(`  item: ${r.pluggy_item_id}`);
	console.log(`  vínculo local: ${vinculo}`);
	console.log(`  pluggy_account_id vinculado: ${r.pluggy_account_id ?? "(null)"}`);
	console.log(`  status: ${r.status ?? "(null)"} | last_synced_at: ${r.last_synced_at ?? "(null)"}`);

	if (apiKey) {
		const item = await getItem(apiKey, r.pluggy_item_id);
		if (item.error) {
			console.log(`  Pluggy item: ERRO ${item.error}`);
		} else {
			console.log(`  Pluggy connector: ${item?.connector?.name ?? "?"} | item.status: ${item?.status ?? "?"}`);
		}
		const env = await listAccounts(apiKey, r.pluggy_item_id);
		if (env.error) {
			console.log(`  Pluggy accounts: ERRO ${env.error}`);
		} else {
			const results = env.results ?? [];
			console.log(`  Pluggy accounts (${results.length}):`);
			for (const a of results) {
				console.log(`    - type=${a.type} subtype=${a.subtype ?? "null"} name=${JSON.stringify(a.name)} id=${a.id.slice(0, 8)}…`);
			}
			const credit = results.filter((a) => a.type === "CREDIT");
			const bank = results.filter((a) => a.type !== "CREDIT");
			console.log(`    → ${credit.length} CREDIT (cartão) / ${bank.length} BANK (conta)`);
		}
	}
	console.log("");
}

console.log("Pronto. Nada gravado.");
