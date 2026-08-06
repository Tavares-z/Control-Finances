#!/usr/bin/env node
// READ-ONLY: imprime dia_fechamento + dia_vencimento dos cartões com conexão OF.
// Uso: node scripts/print-card-days.mjs --no-env-file
import { config } from "dotenv";
import pg from "pg";
if (!process.argv.includes("--no-env-file")) config();
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
	const { rows } = await client.query(
		`select ca.nome, ca.dt_fechamento, ca.dt_vencimento, ca.id
		   from cartoes ca
		   join openfinance_connections c on c.cartao_id = ca.id
		  order by ca.nome`,
	);
	for (const r of rows) {
		console.log(
			`${r.nome}: fecha dia ${r.dt_fechamento} | vence dia ${r.dt_vencimento} | id=${r.id}`,
		);
	}
} finally {
	await client.end();
}
