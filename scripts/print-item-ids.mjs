#!/usr/bin/env node
// READ-ONLY: imprime pluggy_item_id + apelido das conexões OF vinculadas a cartão.
// Uso: node scripts/print-item-ids.mjs --no-env-file
import { config } from "dotenv";
import pg from "pg";
if (!process.argv.includes("--no-env-file")) config();
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
	const { rows } = await client.query(
		`select c.apelido, c.pluggy_item_id, ca.nome
		   from openfinance_connections c
		   join cartoes ca on ca.id = c.cartao_id
		  order by c.apelido`,
	);
	for (const r of rows) {
		console.log(`${r.apelido ?? r.nome}: itemId=${r.pluggy_item_id}`);
	}
} finally {
	await client.end();
}
