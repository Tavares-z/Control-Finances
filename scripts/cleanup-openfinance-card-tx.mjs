#!/usr/bin/env node
// Limpa as transações de CARTÃO vindas do Open Finance (Pluggy) que foram
// gravadas com o SINAL invertido (compra virando "Receita"), para que o próximo
// sync as repuxe já com a correção de sinal aplicada em syncCardConnection.
//
// Identificação SEGURA: só deleta transações do cartão informado que têm
// ofx_fit_id PREENCHIDO. Lançamentos manuais NÃO têm ofx_fit_id, então nunca
// são atingidos. (Pré-requisito confirmado pelo usuário: este cartão NUNCA foi
// importado por OFX — logo todo ofx_fit_id nele é do Open Finance.)
//
// SEGURANÇA:
//   - DRY-RUN por padrão: só CONTA e LISTA (sem valores), não deleta nada.
//   - Só deleta com --apply explícito.
//   - Exige --cardId e --userId explícitos (sem default) para não errar o alvo.
//   - Imprime o host do banco alvo para confirmação visual antes de aplicar.
//
// Usa o driver `pg` (mesmo do app). A DATABASE_URL vem do ambiente/.env vigente;
// para mirar PRODUÇÃO, exporte a DATABASE_URL de prod na sessão antes de rodar
// (mesma disciplina da sonda de credenciais).
//
// Uso (dry-run):
//   node scripts/cleanup-openfinance-card-tx.mjs --cardId=<uuid> --userId=<uuid>
// Uso (aplicar de verdade):
//   node scripts/cleanup-openfinance-card-tx.mjs --cardId=<uuid> --userId=<uuid> --apply

import { config } from "dotenv";
import pg from "pg";

config();

function arg(name) {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.split("=").slice(1).join("=") : undefined;
}

const cardId = arg("cardId");
const userId = arg("userId");
const apply = process.argv.includes("--apply");

if (!cardId || !userId) {
	console.error(
		"Faltou --cardId e/ou --userId.\n" +
			"Uso: node scripts/cleanup-openfinance-card-tx.mjs --cardId=<uuid> --userId=<uuid> [--apply]",
	);
	process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error("DATABASE_URL ausente no ambiente/.env.");
	process.exit(1);
}

let dbHost = "(desconhecido)";
try {
	dbHost = new URL(DATABASE_URL).host;
} catch {
	/* ignora */
}
console.log(`Banco alvo (host): ${dbHost}`);
console.log(`Cartão: ${cardId}`);
console.log(`Usuário: ${userId}`);
console.log(`Modo: ${apply ? "APPLY (vai DELETAR)" : "DRY-RUN (não deleta)"}`);

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

try {
	// Candidatas: cartão + usuário + ofx_fit_id preenchido.
	const { rows } = await client.query(
		`select id, nome, tipo_transacao, periodo, data_compra, ofx_fit_id
		   from lancamentos
		  where cartao_id = $1
		    and user_id = $2
		    and ofx_fit_id is not null
		  order by data_compra desc`,
		[cardId, userId],
	);

	console.log(
		`\nEncontradas ${rows.length} transação(ões) do Open Finance neste cartão.`,
	);
	// Amostra SEM valor monetário (só nome/tipo/período/data) para conferência.
	const sample = rows.slice(0, 30);
	console.log("Amostra (tipo | período | data | nome):");
	for (const r of sample) {
		const d = new Date(r.data_compra).toISOString().slice(0, 10);
		console.log(
			`  ${String(r.tipo_transacao).padEnd(8)} | ${r.periodo} | ${d} | ${r.nome}`,
		);
	}
	if (rows.length > sample.length) {
		console.log(`  … e mais ${rows.length - sample.length}.`);
	}

	const asReceita = rows.filter((r) => r.tipo_transacao === "Receita").length;
	console.log(
		`\nDessas, ${asReceita} estão como "Receita" (as afetadas pelo sinal invertido).`,
	);

	if (!apply) {
		console.log(
			"\nDRY-RUN: nada foi deletado. Revise a amostra acima. Para aplicar, " +
				"rode de novo adicionando --apply.",
		);
	} else {
		const del = await client.query(
			`delete from lancamentos
			  where cartao_id = $1
			    and user_id = $2
			    and ofx_fit_id is not null
			returning id`,
			[cardId, userId],
		);
		console.log(`\n✅ Deletadas ${del.rowCount} transação(ões).`);
		console.log(
			"Próximo passo: dispare um novo sync (abra o dashboard após 1h, ou o " +
				"webhook transactions/created) para repuxar com o sinal correto.",
		);
	}
} finally {
	await client.end();
}
