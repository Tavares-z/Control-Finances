#!/usr/bin/env node
// DIAGNÓSTICO READ-ONLY: quantas transações de Open Finance cada cartão vinculado
// tem, e a data mais recente. Não imprime valores. Não grava nada.
//
// Uso (PROD): node scripts/diagnose-card-tx.mjs --no-env-file

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
	// Cartões que têm conexão OF, com contagem de transações do OF (ofx_fit_id preenchido
	// E source_app='openfinance') e por período.
	const { rows } = await client.query(
		`select ca.nome as cartao,
		        c.last_synced_at,
		        count(t.id)                                as total_of_tx,
		        count(t.id) filter (where t.nome ilike '[possível duplicata]%') as dup_flag,
		        min(t.periodo) as periodo_min,
		        max(t.periodo) as periodo_max,
		        min(t.data_compra) as data_compra_min,
		        max(t.data_compra) as data_compra_max
		   from cartoes ca
		   join openfinance_connections c on c.cartao_id = ca.id
		   left join lancamentos t
		          on t.cartao_id = ca.id
		         and t.ofx_fit_id is not null
		  group by ca.nome, c.last_synced_at
		  order by ca.nome`,
	);
	console.log("Transações de Open Finance por cartão vinculado:\n");
	for (const r of rows) {
		console.log(`━━━ ${r.cartao} ━━━`);
		console.log(`  last_synced_at: ${r.last_synced_at ?? "(null)"}`);
		console.log(`  tx com ofx_fit_id: ${r.total_of_tx} | marcadas [possível duplicata]: ${r.dup_flag}`);
		console.log(`  período: ${r.periodo_min ?? "—"} … ${r.periodo_max ?? "—"}`);
		console.log(`  data_compra: ${r.data_compra_min ?? "—"} … ${r.data_compra_max ?? "—"}\n`);
	}
} finally {
	await client.end();
}
console.log("Pronto. Nada gravado.");
