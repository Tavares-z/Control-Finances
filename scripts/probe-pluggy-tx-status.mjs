#!/usr/bin/env node
// Sonda READ-ONLY para a pergunta: "a Pluggy entrega transações PENDING (compras
// 'Em processamento') no /v2/transactions, ou só POSTED?"
//
// Para cada itemId passado por argumento:
//   1. GET /accounts → acha a(s) account(s) type=CREDIT (cartão).
//   2. GET /v2/transactions?accountId=... para cada cartão, com createdAtFrom
//      cobrindo os últimos N dias (default 60).
//   3. Imprime a CONTAGEM por status e uma amostra por transação com APENAS:
//      status, date e id MASCARADO (8 primeiros chars).
//
// NÃO grava nada, NÃO toca banco. PRIVACIDADE: nunca imprime amount, balance,
// description, descriptionRaw, merchant, category, nem qualquer valor/titular.
//
// Uso:
//   node scripts/probe-pluggy-tx-status.mjs <itemId> [<itemId> ...] [--days=60]

import { config } from "dotenv";

const args = process.argv.slice(2);

// --no-env-file: NÃO carrega o .env (que tem as credenciais de SANDBOX). Use ao
// sondar um item de PRODUÇÃO passando PLUGGY_CLIENT_ID/SECRET na própria sessão —
// senão o .env sobrescreveria as creds de prod e o item real daria 404.
if (!args.includes("--no-env-file")) {
	config();
} else {
	console.log("(--no-env-file: usando só variáveis da sessão, .env ignorado)");
}

const PLUGGY_API_URL = "https://api.pluggy.ai";

const daysArg = args.find((a) => a.startsWith("--days="));
const DAYS = daysArg ? Number.parseInt(daysArg.split("=")[1], 10) || 60 : 60;
const itemIds = args.filter((a) => !a.startsWith("--")).filter(Boolean);

if (itemIds.length === 0) {
	console.error(
		"Uso: node scripts/probe-pluggy-tx-status.mjs <itemId> [<itemId> ...] [--days=60]",
	);
	process.exit(1);
}

async function authenticate() {
	const clientId = process.env.PLUGGY_CLIENT_ID;
	const clientSecret = process.env.PLUGGY_CLIENT_SECRET;
	if (!clientId || !clientSecret) {
		console.error("PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET ausentes no .env.");
		process.exit(1);
	}
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
	const { apiKey } = await res.json();
	return apiKey;
}

async function listCreditAccounts(apiKey, itemId) {
	const res = await fetch(
		`${PLUGGY_API_URL}/accounts?itemId=${encodeURIComponent(itemId)}`,
		{ method: "GET", headers: { "X-API-KEY": apiKey }, cache: "no-store" },
	);
	if (!res.ok) return { error: `HTTP ${res.status}` };
	const body = await res.json();
	const results = body.results ?? [];
	return { accounts: results.filter((a) => a.type === "CREDIT") };
}

async function listTransactions(apiKey, accountId, createdAtFrom) {
	const q = new URLSearchParams({ accountId, createdAtFrom });
	const res = await fetch(`${PLUGGY_API_URL}/v2/transactions?${q.toString()}`, {
		method: "GET",
		headers: { "X-API-KEY": apiKey },
		cache: "no-store",
	});
	if (!res.ok) return { error: `HTTP ${res.status}` };
	return res.json();
}

function createdAtFromForDays(days) {
	const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
	return d.toISOString().slice(0, 10);
}

const apiKey = await authenticate();
const createdAtFrom = createdAtFromForDays(DAYS);

for (const itemId of itemIds) {
	const masked = `${itemId.slice(0, 8)}…`;
	console.log(`\n=== item ${masked} (últimos ${DAYS} dias, desde ${createdAtFrom}) ===`);

	const { accounts, error } = await listCreditAccounts(apiKey, itemId);
	if (error) {
		console.log(`  ERRO em /accounts: ${error}`);
		continue;
	}
	if (!accounts || accounts.length === 0) {
		console.log("  Nenhuma account CREDIT neste item.");
		continue;
	}

	for (const acc of accounts) {
		const accMasked = `${acc.id.slice(0, 8)}…`;
		console.log(`\n  cartão ${accMasked} — name=${JSON.stringify(acc.name)}`);

		const page = await listTransactions(apiKey, acc.id, createdAtFrom);
		if (page.error) {
			console.log(`    ERRO em /v2/transactions: ${page.error}`);
			continue;
		}
		const txs = page.results ?? [];
		console.log(`    total de transações: ${txs.length}  (next=${JSON.stringify(page.next)})`);

		// Contagem por status.
		const byStatus = {};
		for (const t of txs) {
			const s = t.status ?? "(sem status)";
			byStatus[s] = (byStatus[s] ?? 0) + 1;
		}
		console.log(`    por status: ${JSON.stringify(byStatus)}`);

		// Quantas trazem creditCardMetadata.billId preenchido? (pergunta do roteamento
		// de período pelo banco). Só CONTAGEM aqui — os detalhes vão na amostra.
		const withBillId = txs.filter(
			(t) => t.creditCardMetadata?.billId,
		).length;
		console.log(
			`    com creditCardMetadata.billId preenchido: ${withBillId}/${txs.length}`,
		);

		// Amostra: mais recentes primeiro. Imprime SÓ o SINAL do amount (+/−), nunca
		// o valor; status/date; billId MASCARADO; billForecastDate; parcela.
		const sample = [...txs]
			.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
			.slice(0, 20);
		console.log(
			"    amostra (sinal | status | date | descr.presente? | billId mascarado | billForecast | parcela):",
		);
		for (const t of sample) {
			const sign = t.amount < 0 ? "−" : t.amount > 0 ? "+" : "0";
			const m = t.creditCardMetadata ?? {};
			const bill = m.billId ? `${String(m.billId).slice(0, 8)}…` : "—";
			const forecast = m.billForecastDate ?? "—";
			const inst =
				m.installmentNumber != null && m.totalInstallments != null
					? `${m.installmentNumber}/${m.totalInstallments}`
					: "—";
			// "descrição presente?" só sinaliza se há texto — NÃO imprime o texto.
			const hasDesc = t.description ? "sim" : "não";
			console.log(
				`      ${sign} | ${String(t.status).padEnd(9)} | ${t.date} | ${hasDesc} | ${bill} | ${forecast} | ${inst}`,
			);
		}
	}
}

console.log("\nPronto. Nada gravado, nenhum banco tocado, nenhum valor impresso.");
