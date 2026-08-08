#!/usr/bin/env node
// READ-ONLY: prova que o filtro do /v2/transactions deve ser `dateFrom` (data da
// compra) e não `createdAtFrom` (data em que a Pluggy importou — congelada no dia
// da conexão). Roda a MESMA janela com os dois params e conta/mostra faixa de date.
//
// Uso: node scripts/probe-datefrom-vs-createdatfrom.mjs <itemId> --days=40 --no-env-file

import { config } from "dotenv";
const args = process.argv.slice(2);
if (!args.includes("--no-env-file")) config();
else console.log("(--no-env-file)");
function arg(n){const h=args.find(a=>a.startsWith(`--${n}=`));return h?h.split("=").slice(1).join("="):undefined;}
const PLUGGY="https://api.pluggy.ai";
const itemId=args.filter(a=>!a.startsWith("--"))[0];
const DAYS=arg("days")?Number.parseInt(arg("days"),10):40;
if(!itemId){console.error("Uso: node scripts/probe-datefrom-vs-createdatfrom.mjs <itemId> --days=40 --no-env-file");process.exit(1);}

async function auth(){const r=await fetch(`${PLUGGY}/auth`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clientId:process.env.PLUGGY_CLIENT_ID,clientSecret:process.env.PLUGGY_CLIENT_SECRET}),cache:"no-store"});if(!r.ok){console.error(`/auth ${r.status}`);process.exit(1);}return (await r.json()).apiKey;}
async function get(k,p){const r=await fetch(`${PLUGGY}${p}`,{headers:{"X-API-KEY":k},cache:"no-store"});const b=await r.json().catch(()=>({}));return {status:r.status,b};}

const k=await auth();
const accs=await get(k,`/accounts?itemId=${encodeURIComponent(itemId)}`);
const credit=(accs.b.results??[]).find(a=>a.type==="CREDIT");
if(!credit){console.error("sem CREDIT");process.exit(1);}
const from=new Date(Date.now()-DAYS*86400000).toISOString().slice(0,10);
console.log(`\naccount ${credit.id.slice(0,8)}… | janela = últimos ${DAYS} dias (>= ${from})\n`);

for(const [label,param] of [["createdAtFrom (ATUAL)","createdAtFrom"],["dateFrom (FIX)","dateFrom"],["from (v1-style)","from"]]){
  const {status,b}=await get(k,`/v2/transactions?accountId=${credit.id}&${param}=${from}`);
  const txs=b.results??[];
  const dates=txs.map(t=>t.date).filter(Boolean).sort();
  const dmin=(dates[0]??"—").slice(0,10), dmax=(dates[dates.length-1]??"—").slice(0,10);
  console.log(`${label.padEnd(24)} HTTP ${status} | ${txs.length} tx | date ${dmin}…${dmax} | next=${JSON.stringify(b.next)}${b.message?` | msg=${b.message}`:""}`);
}
console.log("\nInterpretação: se dateFrom traz as compras recentes (por date) e createdAtFrom traz pouco/nada,");
console.log("confirma que o sync deve filtrar por dateFrom. Nada gravado.");
