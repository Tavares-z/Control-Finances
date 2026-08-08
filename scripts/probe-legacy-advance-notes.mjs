#!/usr/bin/env node
// DIAGNÓSTICO READ-ONLY: procura lançamentos com o prefixo ANTIGO de adiantamento
// "AUTO_ADIANTAMENTO:" (v3.6.0), que NÃO casa as exclusões `NOT LIKE 'AUTO_FATURA:%'`
// e portanto pode estar contando como receita/despesa real no dashboard.
// Compara com o prefixo atual "AUTO_FATURA:". Não grava nada.
//
// Uso (PROD): node scripts/probe-legacy-advance-notes.mjs --no-env-file

import { config } from "dotenv";
import pg from "pg";

if (!process.argv.includes("--no-env-file")) config();
else console.log("(--no-env-file: usando DATABASE_URL da sessão)");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error("DATABASE_URL ausente.");
	process.exit(1);
}
let host = "?";
try { host = new URL(DATABASE_URL).host; } catch {}
console.log(`Banco alvo: ${host}\n`);

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
try {
	for (const prefix of ["AUTO_ADIANTAMENTO:", "AUTO_FATURA:"]) {
		const { rows } = await client.query(
			`select tipo_transacao,
			        count(*)         as qtd,
			        sum(valor)       as soma_valor,
			        min(anotacao)    as exemplo_nota
			   from lancamentos
			  where anotacao like $1
			  group by tipo_transacao
			  order by tipo_transacao`,
			[`${prefix}%`],
		);
		console.log(`━━━ prefixo "${prefix}" ━━━`);
		if (rows.length === 0) {
			console.log("  (nenhum lançamento)\n");
			continue;
		}
		for (const r of rows) {
			console.log(
				`  ${r.tipo_transacao}: ${r.qtd} lançamento(s) | soma valor = ${r.soma_valor} | ex.: ${r.exemplo_nota}`,
			);
		}
		console.log("");
	}
} finally {
	await client.end();
}
console.log("Pronto. Nada gravado.");
