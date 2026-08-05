#!/usr/bin/env node
// READ-ONLY: imprime cartao_id + user_id das conexões OF vinculadas a cartão,
// pra alimentar o reset-openfinance-throttle.mjs. Não grava nada.
// Uso (PROD): node scripts/print-card-conn-ids.mjs --no-env-file

import { config } from "dotenv";
import pg from "pg";

if (!process.argv.includes("--no-env-file")) config();
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
	const { rows } = await client.query(
		`select c.apelido, c.cartao_id, c.user_id, c.last_synced_at, ca.nome
		   from openfinance_connections c
		   join cartoes ca on ca.id = c.cartao_id
		  order by c.apelido`,
	);
	for (const r of rows) {
		console.log(`\n${r.apelido ?? r.nome}:`);
		console.log(`  --cardId=${r.cartao_id} --userId=${r.user_id}`);
		console.log(`  last_synced_at: ${r.last_synced_at}`);
	}
} finally {
	await client.end();
}
