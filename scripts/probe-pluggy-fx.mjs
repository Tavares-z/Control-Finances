#!/usr/bin/env node
// SONDA READ-ONLY para COMPRA EM MOEDA ESTRANGEIRA: dumpa os campos que a Pluggy
// expõe numa transação cujo nome casa --like, pra entender como ela representa
// câmbio/IOF (amount convertido? valor em USD? campos separados de FX?).
//
// É SEU PRÓPRIO dado e o ponto é justamente ver o valor — então IMPRIME amount e
// os campos de câmbio. NÃO grava nada. Uso:
//   node scripts/probe-pluggy-fx.mjs <itemId> --like=Claude --no-env-file

import { config } from "dotenv";

const args = process.argv.slice(2);
if (!args.includes("--no-env-file")) config();
else console.log("(--no-env-file: usando só variáveis da sessão)");

const PLUGGY_API_URL = "https://api.pluggy.ai";
const itemId = args.filter((a) => !a.startsWith("--"))[0];
const likeArg = args.find((a) => a.startsWith("--like="));
const like = likeArg ? likeArg.split("=").slice(1).join("=").toUpperCase() : null;

if (!itemId || !like) {
	console.error("Uso: node scripts/probe-pluggy-fx.mjs <itemId> --like=<trecho> --no-env-file");
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

async function allTx(apiKey, accountId) {
	const q = new URLSearchParams({ accountId });
	const res = await fetch(`${PLUGGY_API_URL}/v2/transactions?${q.toString()}`, {
		headers: { "X-API-KEY": apiKey },
		cache: "no-store",
	});
	const body = await res.json();
	return body.results ?? [];
}

const apiKey = await authenticate();
const accountId = await creditAccountId(apiKey, itemId);
if (!accountId) {
	console.error("Nenhuma account CREDIT neste item.");
	process.exit(1);
}
const txs = await allTx(apiKey, accountId);
const hits = txs.filter((t) => (t.description ?? "").toUpperCase().includes(like));

console.log(`\nitem ${itemId.slice(0, 8)}… — ${hits.length} tx casando "${like}"\n`);
for (const t of hits) {
	// Dump dos campos potencialmente relevantes de câmbio. A Pluggy pode expor:
	// amount (na moeda da conta = BRL já convertido?), amountInAccountCurrency,
	// currencyCode, e um bloco de FX/IOF em creditCardMetadata ou paymentData.
	console.log("─".repeat(60));
	console.log(`description:            ${t.description}`);
	console.log(`date:                  ${t.date}`);
	console.log(`amount:                ${t.amount}`);
	console.log(`amountInAccountCurrency:${t.amountInAccountCurrency ?? "—"}`);
	console.log(`currencyCode:          ${t.currencyCode ?? "—"}`);
	console.log(`type:                  ${t.type ?? "—"}`);
	console.log(`category:              ${t.category ?? "—"}`);
	// Campos que às vezes trazem detalhe de FX:
	if (t.creditCardMetadata)
		console.log(`creditCardMetadata:    ${JSON.stringify(t.creditCardMetadata)}`);
	if (t.paymentData)
		console.log(`paymentData:           ${JSON.stringify(t.paymentData)}`);
	if (t.merchant)
		console.log(`merchant:              ${JSON.stringify(t.merchant)}`);
	// Dump de QUAISQUER chaves que contenham "curr", "fx", "exchange", "iof":
	const fxKeys = Object.keys(t).filter((k) =>
		/curr|fx|exchange|iof|foreign|origin/i.test(k),
	);
	if (fxKeys.length)
		console.log(`outros campos FX:      ${JSON.stringify(Object.fromEntries(fxKeys.map((k) => [k, t[k]])))}`);
}
console.log("─".repeat(60));
console.log("\n(read-only; é seu próprio dado — valores impressos de propósito)");
