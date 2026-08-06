#!/usr/bin/env node
// READ-ONLY: confirma que a tabela openfinance_ignored_series existe no banco alvo
// (o push do entrypoint deve tê-la criado no deploy). Lista também as linhas atuais.
// Uso: node scripts/check-ignored-series-table.mjs --no-env-file

import { config } from "dotenv";
import pg from "pg";

if (!process.argv.includes("--no-env-file")) config();
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
	const { rows: exists } = await client.query(
		`select to_regclass('public.openfinance_ignored_series') as tbl`,
	);
	if (!exists[0]?.tbl) {
		console.log("❌ Tabela openfinance_ignored_series NÃO existe. O push não a criou.");
		console.log("   (rodar manualmente a migration 0045 ou drizzle-kit push apontando pra prod)");
		process.exit(0);
	}
	console.log("✅ Tabela openfinance_ignored_series existe.");
	const { rows } = await client.query(
		`select user_id, cartao_id, descricao, qtde_parcela, amount_key, created_at
		   from openfinance_ignored_series order by created_at desc`,
	);
	console.log(`Linhas atuais: ${rows.length}`);
	for (const r of rows) {
		console.log(`  ${r.descricao} | total=${r.qtde_parcela ?? "—"} | amountKey=${r.amount_key ?? "—"} | ${r.created_at}`);
	}
} finally {
	await client.end();
}
