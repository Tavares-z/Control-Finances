#!/usr/bin/env node
// Lista os usuários (id + email) do banco apontado por DATABASE_URL.
// READ-ONLY. Serve só para você descobrir seu userId.
//
// Uso (mirando prod): exporte a DATABASE_URL de prod na sessão e rode:
//   node scripts/whoami-db.mjs

import { config } from "dotenv";
import pg from "pg";

// Só carrega o .env se você NÃO passar --no-env-file. Para mirar PROD, exporte a
// DATABASE_URL pública de prod na sessão e rode com --no-env-file — senão o .env
// (staging) sobrescreve a URL que você setou.
if (!process.argv.includes("--no-env-file")) {
	config();
} else {
	console.log("(--no-env-file: usando só a DATABASE_URL da sessão)");
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error("DATABASE_URL ausente no ambiente/.env.");
	process.exit(1);
}

let host = "(desconhecido)";
try {
	host = new URL(DATABASE_URL).host;
} catch {
	/* ignora */
}
console.log(`Banco alvo (host): ${host}\n`);

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
try {
	const { rows } = await client.query('select id, email from "user" order by email');
	console.table(rows);
} finally {
	await client.end();
}
