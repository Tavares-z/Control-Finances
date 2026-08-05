#!/usr/bin/env node
// READ-ONLY: investiga as "[possível duplicata]" de um cartão — agrupa por
// (descrição, valor, dia, parcela_atual/qtde_parcela) pra revelar se são parcelas
// DISTINTAS (12/21, 13/21...) ou a MESMA parcela repetida (12/21 duas vezes).
// Decide se "suprimir por conteúdo" é seguro. Não grava nada.
//
// Uso: node scripts/audit-duplicate-installments.mjs --cardId=<uuid> --userId=<uuid> --no-env-file

import { config } from "dotenv";
import pg from "pg";

if (!process.argv.includes("--no-env-file")) config();
function arg(n) { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split("=").slice(1).join("=") : undefined; }
const cardId = arg("cardId"), userId = arg("userId");
if (!cardId || !userId) { console.error("faltou --cardId/--userId"); process.exit(1); }

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
	// Agrupa por conteúdo + parcela pra ver se a MESMA parcela aparece 2x.
	const { rows } = await client.query(
		`select
		    regexp_replace(nome, '^\\[possível duplicata\\] ', '') as nome_limpo,
		    tipo_transacao,
		    valor,
		    data_compra::date as dia,
		    parcela_atual, qtde_parcela,
		    count(*) as qtd,
		    count(*) filter (where nome like '[possível duplicata]%') as marcadas
		   from lancamentos
		  where cartao_id = $1 and user_id = $2 and ofx_fit_id is not null
		  group by nome_limpo, tipo_transacao, valor, dia, parcela_atual, qtde_parcela
		 having count(*) > 1
		  order by qtd desc, nome_limpo
		  limit 60`,
		[cardId, userId],
	);
	if (rows.length === 0) {
		console.log("Nenhum grupo com count>1 (nenhuma duplicata de conteúdo+parcela).");
	} else {
		console.log(`Grupos com MAIS DE 1 lançamento de mesmo conteúdo+parcela:\n`);
		console.log("qtd (marcadas) | tipo    | valor    | dia        | parcela | nome");
		for (const r of rows) {
			const parc = r.parcela_atual && r.qtde_parcela ? `${r.parcela_atual}/${r.qtde_parcela}` : "—";
			console.log(
				`  ${String(r.qtd).padStart(2)} (${r.marcadas}) | ${String(r.tipo_transacao).padEnd(7)} | ${Number(r.valor).toFixed(2).padStart(8)} | ${new Date(r.dia).toISOString().slice(0,10)} | ${parc.padEnd(7)} | ${r.nome_limpo}`,
			);
		}
		console.log(`\n⚠️ Se 'parcela' é DISTINTA em cada linha do grupo → NÃO são duplicatas, são parcelas diferentes (suprimir por dia|valor|desc apagaria parcelas legítimas).`);
		console.log(`   Se a MESMA parcela (ex: 12/21) aparece com qtd>1 → é duplicata real.`);
	}
} finally {
	await client.end();
}
