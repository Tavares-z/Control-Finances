#!/usr/bin/env node
// READ-ONLY: lista TODOS os billId distintos que aparecem nas transações do MP,
// com dueDate + billClosingDate de cada, ordenados. Objetivo: confirmar se a Pluggy
// JÁ criou o bill da fatura que fechou 05/08 (dueDate 10/08) ou se o bill mais
// recente ainda é o de julho. Também conta transações PENDING com billForecastDate
// de 2026-08 (parcelas projetadas pra agosto que ainda não viraram bill).
//
// Uso: node scripts/probe-mp-bills.mjs a1b246f9-f85c-4d21-aa5a-fdd1498f7ecc --no-env-file

import { config } from "dotenv";
const args = process.argv.slice(2);
if (!args.includes("--no-env-file")) config();
else console.log("(--no-env-file)");
const PLUGGY="https://api.pluggy.ai";
const itemId=args.filter(a=>!a.startsWith("--"))[0];
if(!itemId){console.error("Uso: node scripts/probe-mp-bills.mjs <itemId> --no-env-file");process.exit(1);}

async function auth(){const r=await fetch(`${PLUGGY}/auth`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clientId:process.env.PLUGGY_CLIENT_ID,clientSecret:process.env.PLUGGY_CLIENT_SECRET}),cache:"no-store"});if(!r.ok){console.error(`/auth ${r.status}`);process.exit(1);}return (await r.json()).apiKey;}
async function get(k,p){const r=await fetch(`${PLUGGY}${p}`,{headers:{"X-API-KEY":k},cache:"no-store"});const b=await r.json().catch(()=>({}));return {status:r.status,b};}

const k=await auth();
const accs=await get(k,`/accounts?itemId=${encodeURIComponent(itemId)}`);
const credit=(accs.b.results??[]).find(a=>a.type==="CREDIT");
if(!credit){console.error("sem CREDIT");process.exit(1);}

const page=await get(k,`/v2/transactions?accountId=${credit.id}`);
const txs=page.b.results??[];

// billIds distintos + detalhe
const billIds=[...new Set(txs.map(t=>t.creditCardMetadata?.billId).filter(Boolean))];
console.log(`\n${billIds.length} bill(s) distinto(s) referenciados pelas transações:`);
console.log("(billId… | dueDate | closingDate | período do dueDate)");
const bills=[];
for(const id of billIds){
  const {b}=await get(k,`/bills/${id}`);
  bills.push({id, due:b.dueDate, close:b.billClosingDate??b.closeDate});
}
bills.sort((a,b)=>String(a.due).localeCompare(String(b.due)));
for(const bl of bills){
  console.log(`  ${bl.id.slice(0,8)}… | ${bl.due??"—"} | ${bl.close??"—"} | ${String(bl.due??"").slice(0,7)}`);
}

// PENDING com billForecastDate de agosto
const pendAug=txs.filter(t=>t.status==="PENDING" && (t.creditCardMetadata?.billForecastDate??"").startsWith("2026-08"));
console.log(`\nPENDING com billForecastDate 2026-08: ${pendAug.length}`);
for(const t of pendAug){
  const m=t.creditCardMetadata??{};
  console.log(`  ${(t.date??"").slice(0,10)} | ${t.amount} | ${m.installmentNumber}/${m.totalInstallments} | ${t.description} | billId=${m.billId?m.billId.slice(0,8)+"…":"—"}`);
}
console.log("\nInterpretação: se NÃO há bill com dueDate 2026-08 nem PENDING forecast 2026-08 com as parcelas");
console.log("3/3 (16,01) e 2/5 (13,03), a Pluggy ainda não sincronizou a fatura que fechou 05/08. Nada gravado.");
