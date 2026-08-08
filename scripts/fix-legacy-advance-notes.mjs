#!/usr/bin/env node
// MIGRAÇÃO DE DADO: converte lançamentos com o prefixo ANTIGO de adiantamento
// "AUTO_ADIANTAMENTO:{cardId}:{period}:{leg}" (v3.6.0, 4 partes) para o formato
// ATUAL "AUTO_FATURA:{cardId}:{period}:adv:{leg}:{id}" (6 partes), para que voltem
// a herdar as exclusões `NOT LIKE 'AUTO_FATURA:%'` e parem de contar como
// receita/despesa real no dashboard.
//
// - Agrupa por (cardId, period): as pernas ":card" e ":account" do MESMO par
//   recebem o MESMO id (UUID) — é a chave que liga o par (removeInvoiceAdvanceAction).
// - Dry-run por padrão. Passe --apply para gravar.
//
// Uso (PROD, dry-run):  node scripts/fix-legacy-advance-notes.mjs --no-env-file
// Uso (PROD, gravando): node scripts/fix-legacy-advance-notes.mjs --no-env-file --apply

import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import pg from "pg";

if (!process.argv.includes("--no-env-file")) config();
else console.log("(--no-env-file: usando DATABASE_URL da sessão)");

const APPLY = process.argv.includes("--apply");
const OLD_PREFIX = "AUTO_ADIANTAMENTO:";
const NEW_PREFIX = "AUTO_FATURA:";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error("DATABASE_URL ausente.");
	process.exit(1);
}
let host = "?";
try { host = new URL(DATABASE_URL).host; } catch {}
console.log(`Banco alvo: ${host}`);
console.log(APPLY ? "MODO: --apply (VAI GRAVAR)\n" : "MODO: dry-run (nada será gravado)\n");

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
try {
	const { rows } = await client.query(
		`select id, anotacao, tipo_transacao, valor
		   from lancamentos
		  where anotacao like $1
		  order by anotacao`,
		[`${OLD_PREFIX}%`],
	);

	if (rows.length === 0) {
		console.log("Nenhum lançamento com prefixo antigo. Nada a fazer.");
		process.exit(0);
	}

	// Agrupa por (cardId, period) para dar o mesmo id às duas pernas do par.
	const pairs = new Map(); // key = "cardId:period" -> { id, legs: [...] }
	for (const r of rows) {
		const parts = r.anotacao.split(":");
		// AUTO_ADIANTAMENTO:{cardId}:{period}:{leg}
		if (parts.length !== 4) {
			console.warn(`  ⚠️ formato inesperado (ignorado): ${r.anotacao}`);
			continue;
		}
		const [, cardId, period, leg] = parts;
		if (leg !== "card" && leg !== "account") {
			console.warn(`  ⚠️ leg inesperada (ignorado): ${r.anotacao}`);
			continue;
		}
		const key = `${cardId}:${period}`;
		if (!pairs.has(key)) pairs.set(key, { id: randomUUID(), cardId, period, legs: [] });
		pairs.get(key).legs.push({ txId: r.id, leg, tipo: r.tipo_transacao, valor: r.valor });
	}

	console.log(`${pairs.size} par(es) de adiantamento legado encontrados:\n`);
	for (const { id, cardId, period, legs } of pairs.values()) {
		console.log(`━━━ cartão ${cardId} · período ${period} · novo id ${id} ━━━`);
		for (const l of legs) {
			const newNote = `${NEW_PREFIX}${cardId}:${period}:adv:${l.leg}:${id}`;
			console.log(`  ${l.tipo} (${l.valor}) [${l.leg}]`);
			console.log(`    ${OLD_PREFIX}...:${l.leg}  →  ${newNote}`);
			if (APPLY) {
				await client.query(`update lancamentos set anotacao = $1 where id = $2`, [newNote, l.txId]);
			}
		}
		if (legs.length !== 2) {
			console.warn(`  ⚠️ par incompleto: ${legs.length} perna(s) (esperado 2 — card+account)`);
		}
		console.log("");
	}

	console.log(APPLY ? "✅ Gravado." : "Dry-run: rode de novo com --apply para gravar.");
} finally {
	await client.end();
}
