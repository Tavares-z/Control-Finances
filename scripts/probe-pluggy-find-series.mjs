#!/usr/bin/env node
// SONDA READ-ONLY: pra UM itemId, lista as transações da account CREDIT cujo
// nome casa um trecho (--like), SEM filtro de janela, mostrando parcela / date /
// createdAt / billForecastDate. Serve pra saber se a Pluggy JÁ EXPÕE as parcelas
// futuras de uma série (2/5, 3/5…) ou se elas ainda não existem na API.
//
// NÃO imprime valor. Uso:
//   node scripts/probe-pluggy-find-series.mjs <itemId> --like=LDCABOS --no-env-file

import { config } from "dotenv";

const args = process.argv.slice(2);
if (!args.includes("--no-env-file")) config();
else console.log("(--no-env-file: usando só variáveis da sessão)");

const PLUGGY_API_URL = "https://api.pluggy.ai";
const itemId = args.filter((a) => !a.startsWith("--"))[0];
const likeArg = args.find((a) => a.startsWith("--like="));
const like = likeArg ? likeArg.split("=").slice(1).join("=").toUpperCase() : null;

if (!itemId || !like) {
	console.error("Uso: node scripts/probe-pluggy-find-series.mjs <itemId> --like=<trecho> --no-env-file");
	process.exit(1);
}

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
	const res = await fetch(`${PLUGGY_API_URL}/accounts?itemId=${encodeURIComponent(itemId)}`, {
		headers: { "X-API-KEY": apiKey },
		cache: "no-store",
	});
	const body = await res.json();
	return (body.results ?? []).find((a) => a.type === "CREDIT")?.id ?? null;
}

// Bate EXATO como o client real: só accountId (+ createdAtFrom opcional).
// Sem page/pageSize (isso gera HTTP 400). Faz 2 chamadas: sem filtro e com
// createdAtFrom=90d, e une os resultados por id (a Pluggy filtra por createdAt).
async function allTransactions(apiKey, accountId) {
	const byId = new Map();
	async function pull(params, label) {
		const q = new URLSearchParams({ accountId, ...params });
		const res = await fetch(`${PLUGGY_API_URL}/v2/transactions?${q.toString()}`, {
			headers: { "X-API-KEY": apiKey },
			cache: "no-store",
		});
		if (!res.ok) {
			console.log(`  ${label}: HTTP ${res.status}`);
			return;
		}
		const body = await res.json();
		for (const t of body.results ?? []) byId.set(t.id, t);
		console.log(`  ${label}: ${(body.results ?? []).length} tx | next=${JSON.stringify(body.next)}`);
	}
	const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
	await pull({}, "sem filtro            ");
	await pull({ createdAtFrom: daysAgo(90) }, "createdAtFrom=hoje−90d");
	await pull({ createdAtFrom: daysAgo(400) }, "createdAtFrom=hoje−400d");
	return [...byId.values()];
}

const apiKey = await authenticate();
const accountId = await creditAccountId(apiKey, itemId);
if (!accountId) {
	console.error("Nenhuma account CREDIT neste item.");
	process.exit(1);
}
const txs = await allTransactions(apiKey, accountId);
const hits = txs.filter((t) => (t.description ?? "").toUpperCase().includes(like));

console.log(`\nitem ${itemId.slice(0, 8)}… / cartão ${accountId.slice(0, 8)}…`);
console.log(`Total tx varridas: ${txs.length} | casando "${like}": ${hits.length}\n`);
console.log("parcela | date       | createdAt  | billForecast | billId? | description");
for (const t of hits) {
	const m = t.creditCardMetadata ?? {};
	const parcela =
		m.installmentNumber && m.totalInstallments
			? `${m.installmentNumber}/${m.totalInstallments}`
			: "—";
	const date = (t.date ?? "").slice(0, 10) || "—";
	const created = (t.createdAt ?? "").slice(0, 10) || "—";
	const forecast = (m.billForecastDate ?? "").slice(0, 10) || "—";
	const hasBill = m.billId ? "sim" : "—";
	console.log(
		`${parcela.padEnd(7)} | ${date} | ${created} | ${forecast.padEnd(12)} | ${hasBill.padEnd(7)} | ${t.description}`,
	);
}
console.log("\n(read-only, nenhum valor impresso)");
