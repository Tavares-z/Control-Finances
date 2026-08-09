#!/usr/bin/env node
// READ-ONLY: para um período-alvo (YYYY-MM), lista o que a Pluggy roteia PRA esse
// período (via billId->dueDate ou billForecastDate) e compara com o que está no
// nosso banco naquele período. Mostra o que a Pluggy tem e nós não temos, e o
// período onde nós colocamos cada uma (pra achar erro de roteamento vs ausência).
//
// Uso: node scripts/recon-period.mjs <itemId> <cardIdLocal> <YYYY-MM> --no-env-file

import { config } from "dotenv";
import pg from "pg";
const args = process.argv.slice(2);
if (!args.includes("--no-env-file")) config();
else console.log("(--no-env-file)");
const PLUGGY = "https://api.pluggy.ai";
const [itemId, cardIdLocal, target] = args.filter((a) => !a.startsWith("--"));
if (!itemId || !cardIdLocal || !target) { console.error("Uso: node scripts/recon-period.mjs <itemId> <cardIdLocal> <YYYY-MM> --no-env-file"); process.exit(1); }

async function auth(){const r=await fetch(`${PLUGGY}/auth`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clientId:process.env.PLUGGY_CLIENT_ID,clientSecret:process.env.PLUGGY_CLIENT_SECRET}),cache:"no-store"});if(!r.ok){console.error(`/auth ${r.status}`);process.exit(1);}return (await r.json()).apiKey;}
async function get(k,p){const r=await fetch(`${PLUGGY}${p}`,{headers:{"X-API-KEY":k},cache:"no-store"});return {status:r.status,b:await r.json().catch(()=>({}))};}

const k=await auth();
const accs=await get(k,`/accounts?itemId=${encodeURIComponent(itemId)}`);
const credit=(accs.b.results??[]).find(a=>a.type==="CREDIT");
const page=await get(k,`/v2/transactions?accountId=${credit.id}`);
const txs=page.b.results??[];

const billCache=new Map();
async function periodOf(t){const m=t.creditCardMetadata??{};if(m.billId){if(!billCache.has(m.billId)){const b=await get(k,`/bills/${m.billId}`);billCache.set(m.billId,(b.b.dueDate??"").slice(0,7));}return billCache.get(m.billId)||"?";}return (m.billForecastDate??"?").slice(0,7);}

// Pluggy tx que caem no período-alvo
const inTarget=[];
for(const t of txs){const p=await periodOf(t);if(p===target) inTarget.push({t,p});}

const client=new pg.Client({connectionString:process.env.DATABASE_URL});
await client.connect();
try{
  const {rows}=await client.query(`select ofx_fit_id, periodo, valor, nome from lancamentos where cartao_id=$1 and ofx_fit_id is not null`,[cardIdLocal]);
  const byFit=new Map(rows.map(r=>[r.ofx_fit_id,r]));

  console.log(`\n═══ Pluggy roteia ${inTarget.length} tx PARA ${target} ═══`);
  console.log("date       | amount | status | parc | no nosso banco? (período) | nome");
  let missing=0, sum=0;
  for(const {t} of inTarget){
    const m=t.creditCardMetadata??{};
    const inst=m.installmentNumber!=null?`${m.installmentNumber}/${m.totalInstallments}`:"—";
    const db=byFit.get(t.id);
    const where=db?`SIM (${db.periodo})`:"NÃO";
    if(!db) missing++;
    sum+=t.amount;
    console.log(`${(t.date??"").slice(0,10)} | ${String(t.amount).padStart(8)} | ${(t.status??"").padEnd(7)} | ${inst.padEnd(5)} | ${where.padEnd(14)} | ${t.description??""}`);
  }
  console.log(`\nSoma (com sinal) do que a Pluggy roteia pra ${target}: ${sum.toFixed(2)}`);
  console.log(`Faltando no nosso banco: ${missing}`);
}finally{await client.end();}
console.log("\nNada gravado.");
