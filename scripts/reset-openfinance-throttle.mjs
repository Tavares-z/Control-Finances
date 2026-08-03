#!/usr/bin/env node
// Zera o last_synced_at da(s) conexão(ões) Open Finance vinculada(s) a um cartão,
// para o próximo sync furar o throttle de 1h e repuxar imediatamente.
//
// Uso apenas operacional (ex: depois de limpar transações e querer repuxar já).
// DRY-RUN por padrão; só aplica com --apply.
//
// Uso:
//   node scripts/reset-openfinance-throttle.mjs --cardId=<uuid> --userId=<uuid> --no-env-file [--apply]

import { config } from "dotenv";
import pg from "pg";

if (!process.argv.includes("--no-env-file")) {
	config();
} else {
	console.log("(--no-env-file: usando só a DATABASE_URL da sessão)");
}

function arg(name) {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.split("=").slice(1).join("=") : undefined;
}

const cardId = arg("cardId");
const userId = arg("userId");
const apply = process.argv.includes("--apply");

if (!cardId || !userId) {
	console.error(
		"Faltou --cardId e/ou --userId.\n" +
			"Uso: node scripts/reset-openfinance-throttle.mjs --cardId=<uuid> --userId=<uuid> --no-env-file [--apply]",
	);
	process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error("DATABASE_URL ausente.");
	process.exit(1);
}

let host = "(desconhecido)";
try {
	host = new URL(DATABASE_URL).host;
} catch {
	/* ignora */
}
console.log(`Banco alvo (host): ${host}`);
console.log(`Cartão: ${cardId}`);
console.log(`Modo: ${apply ? "APPLY (vai zerar)" : "DRY-RUN"}`);

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
try {
	const { rows } = await client.query(
		`select id, apelido, last_synced_at
		   from openfinance_connections
		  where cartao_id = $1 and user_id = $2`,
		[cardId, userId],
	);
	console.log(`\nConexões vinculadas a este cartão: ${rows.length}`);
	for (const r of rows) {
		console.log(
			`  id=${r.id} | apelido=${r.apelido ?? "—"} | last_synced_at=${r.last_synced_at ?? "(null)"}`,
		);
	}

	if (!apply) {
		console.log("\nDRY-RUN: nada alterado. Rode com --apply para zerar o last_synced_at.");
	} else {
		const upd = await client.query(
			`update openfinance_connections
			    set last_synced_at = null, updated_at = now()
			  where cartao_id = $1 and user_id = $2
			returning id`,
			[cardId, userId],
		);
		console.log(`\n✅ Throttle zerado em ${upd.rowCount} conexão(ões).`);
		console.log("Agora recarregue o dashboard de prod — o sync vai repuxar na hora.");
	}
} finally {
	await client.end();
}
