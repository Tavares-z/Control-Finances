#!/usr/bin/env node
// Auditoria READ-ONLY das transações de um cartão num período de fatura.
// Lista cada transação (data, tipo, valor, nome, origem) e mostra o total de
// COMPRAS (despesas) — pra comparar com a fatura real do banco.
//
// Mostra VALORES (é seu próprio dado, e é o ponto da auditoria). Não grava nada.
//
// Uso:
//   node scripts/audit-card-invoice.mjs --cardId=<uuid> --userId=<uuid> --period=YYYY-MM --no-env-file

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
const period = arg("period");

if (!cardId || !userId || !period) {
	console.error(
		"Uso: node scripts/audit-card-invoice.mjs --cardId=<uuid> --userId=<uuid> --period=YYYY-MM --no-env-file",
	);
	process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error("DATABASE_URL ausente.");
	process.exit(1);
}
let host = "(desconhecido)";
try {
	host = new URL(DATABASE_URL).host;
} catch {}
console.log(`Banco: ${host} | cartão: ${cardId} | período: ${period}\n`);

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
try {
	const { rows } = await client.query(
		`select data_compra, tipo_transacao, valor, nome, anotacao, periodo, ofx_fit_id,
		        case when ofx_fit_id is not null then 'OF/OFX' else 'manual' end as origem,
		        qtde_parcela, parcela_atual
		   from lancamentos
		  where cartao_id = $1 and user_id = $2 and periodo = $3
		  order by data_compra, nome`,
		[cardId, userId, period],
	);

	console.log(`${rows.length} transação(ões) no período ${period}:\n`);
	console.log("data       | tipo    | valor       | origem | parcela | nome");
	let compras = 0;
	let creditos = 0;
	for (const r of rows) {
		const d = new Date(r.data_compra).toISOString().slice(0, 10);
		const v = Number(r.valor);
		const parcela =
			r.qtde_parcela && r.parcela_atual
				? `${r.parcela_atual}/${r.qtde_parcela}`
				: "—";
		const nota = r.anotacao ? ` | nota: ${r.anotacao}` : "";
		console.log(
			`${d} | ${String(r.tipo_transacao).padEnd(7)} | ${v.toFixed(2).padStart(10)} | ${r.origem.padEnd(6)} | ${parcela.padEnd(7)} | ${r.nome}${nota}`,
		);
		if (r.tipo_transacao === "Despesa") compras += v;
		else creditos += v;
	}
	console.log(`\nTotal COMPRAS (despesas): ${Math.abs(compras).toFixed(2)}`);
	console.log(`Total CRÉDITOS (receitas, inclui adiantamento): ${creditos.toFixed(2)}`);
	const liquido = compras + creditos; // soma com sinal
	console.log(
		`\nSALDO LÍQUIDO (sum com sinal = o que o app mostra): ${Math.abs(liquido).toFixed(2)}`,
	);
	console.log(`Contagem: ${rows.length} linha(s)`);
} finally {
	await client.end();
}
