#!/usr/bin/env node
// READ-ONLY (temporário): estado do MP pós-repuxar — last_synced_at, total de tx
// do OF, distribuição por período, e busca das parcelas 13,03/16,01 em QUALQUER período.
import { config } from "dotenv";
import pg from "pg";
if (!process.argv.includes("--no-env-file")) config();
const CARD = "4aadc5be-46e1-4769-be42-b7ff5915774b";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
	const sync = await client.query(
		`select last_synced_at, apelido from openfinance_connections where cartao_id=$1`, [CARD]);
	console.log("last_synced_at:", sync.rows[0]?.last_synced_at, "| apelido:", sync.rows[0]?.apelido);

	const tot = await client.query(
		`select count(*) n, min(data_compra) dmin, max(data_compra) dmax
		   from lancamentos where cartao_id=$1 and ofx_fit_id is not null`, [CARD]);
	console.log(`\ntotal tx OF: ${tot.rows[0].n} | data ${tot.rows[0].dmin?.toISOString?.().slice(0,10)}…${tot.rows[0].dmax?.toISOString?.().slice(0,10)}`);

	const per = await client.query(
		`select periodo, count(*) n, sum(valor) filter(where tipo_transacao='Despesa') desp,
		        sum(valor) filter(where tipo_transacao='Receita') rec
		   from lancamentos where cartao_id=$1 group by periodo order by periodo`, [CARD]);
	console.log("\nperíodo | n | despesas | créditos");
	for (const r of per.rows) console.log(`  ${r.periodo} | ${r.n} | ${r.desp ?? 0} | ${r.rec ?? 0}`);

	const parc = await client.query(
		`select periodo, data_compra, valor, nome, parcela_atual, qtde_parcela
		   from lancamentos where cartao_id=$1 and (abs(valor) in (13.03,16.01))
		   order by data_compra`, [CARD]);
	console.log(`\nparcelas 13,03/16,01 encontradas: ${parc.rows.length}`);
	for (const r of parc.rows) console.log(`  ${r.periodo} | ${r.data_compra?.toISOString?.().slice(0,10)} | ${r.valor} | ${r.parcela_atual}/${r.qtde_parcela} | ${r.nome}`);
} finally { await client.end(); }
