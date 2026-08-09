#!/usr/bin/env node
// READ-ONLY: varre TODAS as tx do cartão e acha por VALOR (amount absoluto), sem
// filtrar por descrição — porque a Pluggy trunca a descrição de formas diferentes
// entre parcelas da MESMA compra (visto: MERCADOLIVRE*MERCADOLIVRE vs *MERC). Mostra
// todos os campos crus de cada match. Objetivo: achar TODAS as parcelas de 13,03 e
// 16,01 mesmo que a descrição varie.
//
// Uso: node scripts/probe-find-by-value.mjs <itemId> --values=13.03,16.01,20.49 --no-env-file

import { config } from "dotenv";
const args = process.argv.slice(2);
if (!args.includes("--no-env-file")) config();
else console.log("(--no-env-file)");
function arg(n){const h=args.find(a=>a.startsWith(`--${n}=`));return h?h.split("=").slice(1).join("="):undefined;}
const PLUGGY="https://api.pluggy.ai";
const itemId=args.filter(a=>!a.startsWith("--"))[0];
const values=(arg("values")??"").split(",").map(v=>Math.round(Math.abs(Number.parseFloat(v))*100)).filter(Boolean);
if(!itemId||values.length===0){console.error("Uso: node scripts/probe-find-by-value.mjs <itemId> --values=13.03,16.01 --no-env-file");process.exit(1);}

async function auth(){const r=await fetch(`${PLUGGY}/auth`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clientId:process.env.PLUGGY_CLIENT_ID,clientSecret:process.env.PLUGGY_CLIENT_SECRET}),cache:"no-store"});if(!r.ok){console.error(`/auth ${r.status}`);process.exit(1);}return (await r.json()).apiKey;}
async function get(k,p){const r=await fetch(`${PLUGGY}${p}`,{headers:{"X-API-KEY":k},cache:"no-store"});return {status:r.status,b:await r.json().catch(()=>({}))};}

const k=await auth();
const accs=await get(k,`/accounts?itemId=${encodeURIComponent(itemId)}`);
const credit=(accs.b.results??[]).find(a=>a.type==="CREDIT");
const page=await get(k,`/v2/transactions?accountId=${credit.id}`);
const txs=page.b.results??[];
console.log(`\nVarrendo ${txs.length} tx por valor(es): ${values.map(c=>(c/100).toFixed(2)).join(", ")}\n`);

const hits=txs.filter(t=>values.includes(Math.round(Math.abs(t.amount)*100)));
hits.sort((a,b)=>(a.date??"").localeCompare(b.date??""));
console.log(`${hits.length} match(es):\n`);
console.log("date       | amount | status  | parc  | forecast | billId   | descrição | id");
for(const t of hits){
  const m=t.creditCardMetadata??{};
  const inst=m.installmentNumber!=null?`${m.installmentNumber}/${m.totalInstallments}`:"—";
  console.log(`${(t.date??"").slice(0,10)} | ${String(t.amount).padStart(7)} | ${(t.status??"").padEnd(7)} | ${inst.padEnd(5)} | ${(m.billForecastDate??"—").padEnd(8)} | ${m.billId?m.billId.slice(0,8):"—      "} | ${(t.description??"").padEnd(26)} | ${t.id.slice(0,8)}`);
}
console.log("\nNada gravado.");
