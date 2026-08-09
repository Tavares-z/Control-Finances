#!/usr/bin/env node
// READ-ONLY: SEGUE O CURSOR `next` até o fim (não para na 1ª página) e agrupa TODAS
// as transações parceladas por série (merchant + totalInstallments + totalAmount),
// mostrando exatamente QUAIS parcelas existem de cada uma. Objetivo: provar se as
// séries 16,01/13,03 estão realmente truncadas ou se estavam numa página não lida.
//
// Também aceita --match=TERMO pra focar num merchant, e --grep=VALOR.
//
// Uso: node scripts/probe-mp-series-full.mjs <itemId> --no-env-file [--match=mercadolivre]

import { config } from "dotenv";
const args = process.argv.slice(2);
if (!args.includes("--no-env-file")) config();
else console.log("(--no-env-file)");
function arg(n){const h=args.find(a=>a.startsWith(`--${n}=`));return h?h.split("=").slice(1).join("="):undefined;}
const PLUGGY="https://api.pluggy.ai";
const itemId=args.filter(a=>!a.startsWith("--"))[0];
const match=(arg("match")??"").toLowerCase();
if(!itemId){console.error("Uso: node scripts/probe-mp-series-full.mjs <itemId> --no-env-file [--match=termo]");process.exit(1);}

async function auth(){const r=await fetch(`${PLUGGY}/auth`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clientId:process.env.PLUGGY_CLIENT_ID,clientSecret:process.env.PLUGGY_CLIENT_SECRET}),cache:"no-store"});if(!r.ok){console.error(`/auth ${r.status}`);process.exit(1);}return (await r.json()).apiKey;}
async function getPath(k,path){return getUrl(k,`${PLUGGY}${path}`);}
async function getUrl(k,url){const r=await fetch(url,{headers:{"X-API-KEY":k},cache:"no-store"});const b=await r.json().catch(()=>({}));return {status:r.status,b};}

const k=await auth();
const accs=await getPath(k,`/accounts?itemId=${encodeURIComponent(itemId)}`);
const credit=(accs.b.results??[]).find(a=>a.type==="CREDIT");
if(!credit){console.error("sem CREDIT");process.exit(1);}

// Segue o cursor até acabar. O `next` da Pluggy pode ser uma URL completa OU um token.
let all=[];
let url=`${PLUGGY}/v2/transactions?accountId=${credit.id}`;
let pages=0;
while(url){
  const {status,b}=await getUrl(k,url);
  if(status!==200){console.log(`página ${pages+1}: HTTP ${status} ${JSON.stringify(b).slice(0,200)}`);break;}
  const res=b.results??[];
  all=all.concat(res);
  pages++;
  const next=b.next;
  if(!next){url=null;}
  else if(typeof next==="string" && next.startsWith("http")){url=next;}
  else if(typeof next==="string"){url=`${PLUGGY}/v2/transactions?accountId=${credit.id}&cursor=${encodeURIComponent(next)}`;}
  else {console.log(`next em formato não-string: ${JSON.stringify(next)}`);url=null;}
  if(pages>20){console.log("parou em 20 páginas (guarda)");break;}
}
console.log(`\nTotal REAL seguindo o cursor: ${all.length} tx em ${pages} página(s).\n`);

// Agrupa parceladas por série
const series=new Map();
for(const t of all){
  const m=t.creditCardMetadata??{};
  if(m.totalInstallments==null||m.totalInstallments<2) continue;
  const merch=(t.description??"").toLowerCase();
  if(match && !merch.includes(match)) continue;
  const key=`${t.description} | total=${m.totalInstallments} | totalAmount=${m.totalAmount??"?"}`;
  if(!series.has(key)) series.set(key,[]);
  series.get(key).push({n:m.installmentNumber,status:t.status,date:(t.date??"").slice(0,10),amount:t.amount,bill:m.billId?m.billId.slice(0,8):"—",forecast:m.billForecastDate??"—",id:t.id.slice(0,8)});
}
console.log(`${series.size} série(s) parcelada(s)${match?` casando "${match}"`:""}:\n`);
for(const [key,parts] of [...series.entries()].sort()){
  parts.sort((a,b)=>(a.n??0)-(b.n??0));
  const have=parts.map(p=>p.n).join(",");
  console.log(`━━━ ${key}`);
  console.log(`    parcelas presentes: [${have}]`);
  for(const p of parts){
    console.log(`      ${String(p.n).padStart(2)}/? | ${p.status.padEnd(8)} | ${p.date} | ${String(p.amount).padStart(9)} | bill=${p.bill} | forecast=${p.forecast} | id=${p.id}`);
  }
  console.log("");
}
console.log("Nada gravado.");
