#!/usr/bin/env node
// SONDA READ-ONLY: qual filtro de janela do /v2/transactions explica o sintoma?
// Para UM itemId (o do Nubank/MP), acha a account CREDIT e conta o retorno com
// janelas diferentes, pra cravar se `createdAtFrom` filtra por createdAt (quando a
// Pluggy inseriu) ou por date (data da transação), e se `from`/`to` existem.
//
// SÓ CONTA. Nunca imprime valor/descrição/titular.
//
// Uso: node scripts/probe-pluggy-window.mjs <itemId> --no-env-file

import { config } from "dotenv";

const args = process.argv.slice(2);
if (!args.includes("--no-env-file")) config();
else console.log("(--no-env-file: usando só variáveis da sessão)");

const PLUGGY_API_URL = "https://api.pluggy.ai";
const itemId = args.filter((a) => !a.startsWith("--"))[0];
if (!itemId) {
	console.error("Uso: node scripts/probe-pluggy-window.mjs <itemId> --no-env-file");
	process.exit(1);
}

async function authenticate() {
	const clientId = process.env.PLUGGY_CLIENT_ID;
	const clientSecret = process.env.PLUGGY_CLIENT_SECRET;
	const res = await fetch(`${PLUGGY_API_URL}/auth`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ clientId, clientSecret }),
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
	const acc = (body.results ?? []).find((a) => a.type === "CREDIT");
	return acc?.id ?? null;
}

// Roda /v2/transactions com um conjunto arbitrário de query params e conta.
async function countWith(apiKey, accountId, params, label) {
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
	const txs = body.results ?? [];
	// Menor e maior `date` (data da transação) do que voltou — só as datas.
	const dates = txs.map((t) => t.date).filter(Boolean).sort();
	const min = dates[0]?.slice(0, 10) ?? "—";
	const max = dates[dates.length - 1]?.slice(0, 10) ?? "—";
	// Menor/maior createdAt também, pra comparar.
	const created = txs.map((t) => t.createdAt).filter(Boolean).sort();
	const cmin = created[0]?.slice(0, 10) ?? "—";
	const cmax = created[created.length - 1]?.slice(0, 10) ?? "—";
	console.log(
		`  ${label}: ${txs.length} tx | next=${JSON.stringify(body.next)} | date ${min}…${max} | createdAt ${cmin}…${cmax}`,
	);
}

function daysAgo(days) {
	return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

const apiKey = await authenticate();
const accountId = await creditAccountId(apiKey, itemId);
if (!accountId) {
	console.error("Nenhuma account CREDIT neste item.");
	process.exit(1);
}
console.log(`item ${itemId.slice(0, 8)}… / cartão ${accountId.slice(0, 8)}…\n`);

// As janelas que interessam:
await countWith(apiKey, accountId, { createdAtFrom: daysAgo(1) }, "createdAtFrom=hoje−1d ");
await countWith(apiKey, accountId, { createdAtFrom: daysAgo(90) }, "createdAtFrom=hoje−90d");
await countWith(apiKey, accountId, { from: daysAgo(1) }, "from=hoje−1d          ");
await countWith(apiKey, accountId, { from: daysAgo(90) }, "from=hoje−90d         ");
await countWith(apiKey, accountId, {}, "sem filtro            ");

console.log("\nInterpretação:");
console.log("- Se createdAtFrom=1d já traz centenas → o filtro é por createdAt e a Pluggy criou tudo recente; o bug NÃO é a janela.");
console.log("- Se createdAtFrom=1d traz pouco mas =90d traz tudo → confirma janela travada (o fix é alargar a janela).");
console.log("- Se `from` traz e createdAtFrom não → devíamos filtrar por `from` (data da transação).");
console.log("\nPronto. Só contagem, nada gravado.");
