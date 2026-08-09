#!/usr/bin/env node
// READ-ONLY: mostra as séries banidas (openfinance_ignored_series) de um cartão.
import { config } from "dotenv";
import pg from "pg";
if (!process.argv.includes("--no-env-file")) config();
function arg(n){const h=process.argv.find(a=>a.startsWith(`--${n}=`));return h?h.split("=").slice(1).join("="):undefined;}
const cardId=arg("cardId");
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
await client.connect();
try{
  const {rows}=await client.query(
    `select descricao as description, qtde_parcela as installment_count, amount_key, created_at
       from openfinance_ignored_series where cartao_id=$1 order by created_at`,[cardId]);
  console.log(`\n${rows.length} série(s) banida(s) neste cartão:\n`);
  for(const r of rows){
    console.log(`  "${r.description}" | total=${r.installment_count ?? "-"} | amountKey=${r.amount_key ?? "-"} | ${r.created_at?.toISOString?.().slice(0,10)}`);
  }
}catch(e){
  // tenta nomes de coluna alternativos
  console.error("erro:", e.message);
  console.log("tentando descobrir colunas...");
  const {rows}=await client.query(`select column_name from information_schema.columns where table_name='openfinance_ignored_series' order by ordinal_position`);
  console.log("colunas:", rows.map(r=>r.column_name).join(", "));
}finally{await client.end();}
