#!/usr/bin/env node
// READ-ONLY: rastreia TODAS as parcelas de uma série (por trecho do nome) num
// cartão, em qualquer período, pra ver onde cada X/Y caiu (ou se faltou).
// Uso:
//   node scripts/trace-series.mjs --cardId=<uuid> --userId=<uuid> --like=LDCABOS --no-env-file

import { config } from "dotenv";
import pg from "pg";

if (!process.argv.includes("--no-env-file")) config();
else console.log("(--no-env-file: usando só a DATABASE_URL da sessão)");

function arg(name) {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.split("=").slice(1).join("=") : undefined;
}

const cardId = arg("cardId");
const userId = arg("userId");
const like = arg("like");

if (!cardId || !userId || !like) {
	console.error(
		"Uso: node scripts/trace-series.mjs --cardId=<uuid> --userId=<uuid> --like=<trecho> --no-env-file",
	);
	process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
	const { rows } = await client.query(
		`select data_compra, periodo, valor, nome, parcela_atual, qtde_parcela, ofx_fit_id
		   from lancamentos
		  where cartao_id = $1 and user_id = $2 and nome ilike $3
		  order by parcela_atual, periodo`,
		[cardId, userId, `%${like}%`],
	);
	console.log(`\n${rows.length} parcela(s) casando "%${like}%":\n`);
	console.log("periodo | parcela | data       | valor    | nome | ofxFitId");
	for (const r of rows) {
		const d = new Date(r.data_compra).toISOString().slice(0, 10);
		const p =
			r.parcela_atual && r.qtde_parcela
				? `${r.parcela_atual}/${r.qtde_parcela}`
				: "—";
		console.log(
			`${r.periodo} | ${p.padEnd(7)} | ${d} | ${Number(r.valor).toFixed(2).padStart(8)} | ${r.nome} | ${r.ofx_fit_id ?? "—"}`,
		);
	}
} finally {
	await client.end();
}
