#!/usr/bin/env node
/**
 * openfinance-sync-runner — dispara/inspeciona o sync Open Finance (Pluggy) de
 * uma conexão de teste contra o banco do `.env`, com o db-guard rodando ANTES
 * (aborta se o destino não estiver na allowlist — mesmo padrão dos outros scripts).
 *
 * USO:
 *   node scripts/openfinance-sync-runner.mjs [<pluggyItemId>] [flags]
 *
 * SELEÇÃO DA CONEXÃO DE TESTE (nesta ordem de precedência):
 *   1. argumento posicional  <pluggyItemId>   (ou --item=<pluggyItemId>)
 *   2. env  OPENFINANCE_TEST_ITEM_ID
 *   3. fallback: arquivo itemid.txt — caminho em env OPENFINANCE_ITEMID_FILE,
 *      senão ./itemid.txt no diretório atual (só se existir)
 *   O item resolve a conexão via openfinance_connections.pluggy_item_id.
 *
 * FLAGS:
 *   --status-only     só imprime last_synced_at/status da conexão + COUNT de
 *                     itens da Inbox com source_app='openfinance' do dono da
 *                     conexão. NÃO sincroniza, NÃO importa o app, NÃO precisa
 *                     das credenciais Pluggy.
 *   --reset-throttle  zera last_synced_at ANTES de sincronizar, forçando o sync
 *                     mesmo dentro da janela de 1h. (Ignorado com --status-only.)
 *
 * PRÉ-REQUISITOS:
 *   - .env com DATABASE_URL (o db-guard exige host na allowlist: localhost / 127.0.0.1
 *     / db / sakura.proxy.rlwy.net). Prod é bloqueada por padrão.
 *   - PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET no ambiente — necessários só para o
 *     sync real (não para --status-only). Nunca são impressos.
 *
 * SEGURANÇA: nenhuma credencial é hardcoded nem ecoada; o SyncResult e o status
 * não contêm segredos. O db-guard é a salvaguarda de destino.
 *
 * ARQUIVOS-COMPANHEIRO (não rodar direto — usados pelo caminho de sync via tsx):
 *   - openfinance-sync-runner.entry.ts        entry TS que importa o sync real
 *   - openfinance-sync-runner.tsconfig.json   mapeia @/* e stuba server-only
 *   - openfinance-sync-runner.server-only.ts  stub no-op de server-only
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { Client } from "pg";

config({ quiet: true }); // carrega .env sem banner no stdout

// ---------------------------------------------------------------------------
// Parsing de flags/argumentos
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const positionals = argv.filter((a) => !a.startsWith("--"));
const itemFlag = [...flags]
	.find((f) => f.startsWith("--item="))
	?.slice("--item=".length);

const STATUS_ONLY = flags.has("--status-only");
const RESET_THROTTLE = flags.has("--reset-throttle");

function resolveItemId() {
	if (itemFlag) return itemFlag.trim();
	if (positionals[0]) return positionals[0].trim();
	if (process.env.OPENFINANCE_TEST_ITEM_ID) {
		return process.env.OPENFINANCE_TEST_ITEM_ID.trim();
	}
	const file = process.env.OPENFINANCE_ITEMID_FILE ?? "itemid.txt";
	if (existsSync(file)) return readFileSync(file, "utf8").trim();
	return null;
}

function fail(message) {
	console.error(`\n✖ openfinance-sync-runner: ${message}\n`);
	process.exit(1);
}

// ---------------------------------------------------------------------------
// db-guard PRIMEIRO — aborta se o destino não estiver liberado
// ---------------------------------------------------------------------------
const guard = spawnSync(
	process.execPath,
	[fileURLToPath(new URL("./guard-db-target.mjs", import.meta.url))],
	{ stdio: "inherit" },
);
if (guard.status !== 0) {
	fail("db-guard bloqueou o destino — abortando.");
}

const itemId = resolveItemId();
if (!itemId) {
	fail(
		"pluggyItemId não informado. Passe como argumento, --item=<id>, " +
			"OPENFINANCE_TEST_ITEM_ID, ou itemid.txt.",
	);
}

// ---------------------------------------------------------------------------
// Localiza a conexão de teste
// ---------------------------------------------------------------------------
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) fail("DATABASE_URL ausente no ambiente/.env.");

const client = new Client({ connectionString: dbUrl });
await client.connect();

async function loadConnection() {
	const { rows } = await client.query(
		`select id, user_id, last_synced_at, status
       from openfinance_connections
      where pluggy_item_id = $1`,
		[itemId],
	);
	return rows;
}

const connections = await loadConnection();
if (connections.length === 0) {
	await client.end();
	fail(`nenhuma conexão openfinance para o item informado.`);
}
if (connections.length > 1) {
	await client.end();
	fail(
		`${connections.length} conexões casam com o item — ambíguo; refine o alvo.`,
	);
}
const connection = connections[0];

async function inboxCount(userId) {
	const { rows } = await client.query(
		`select count(*)::int n from pre_lancamentos
      where user_id = $1 and source_app = 'openfinance'`,
		[userId],
	);
	return rows[0].n;
}

// ---------------------------------------------------------------------------
// --status-only: só leitura, sem sincronizar
// ---------------------------------------------------------------------------
if (STATUS_ONLY) {
	const count = await inboxCount(connection.user_id);
	await client.end();
	console.log("=== STATUS (sem sincronizar) ===");
	console.log(
		JSON.stringify(
			{
				last_synced_at: connection.last_synced_at,
				status: connection.status,
				inbox_openfinance_count: count,
			},
			null,
			2,
		),
	);
	process.exit(0);
}

// ---------------------------------------------------------------------------
// --reset-throttle: zera last_synced_at antes do sync
// ---------------------------------------------------------------------------
if (RESET_THROTTLE) {
	const r = await client.query(
		"update openfinance_connections set last_synced_at = NULL where id = $1",
		[connection.id],
	);
	console.log(`throttle resetado (rowcount=${r.rowCount}).`);
}

await client.end();

// ---------------------------------------------------------------------------
// Sync real: roda via tsx num subprocesso, com um tsconfig que mapeia `@/*` e
// stuba `server-only`.
//
// `server-only` (topo de sync.ts/pluggy-client.ts) não é resolvível — e quando
// é, LANÇA — fora do bundler do Next. O tsx transpila o TS para CJS e usa
// require("server-only"), então um hook ESM não intercepta: só o `paths` do
// tsconfig (que o resolver do tsx honra no require) resolve. Por isso o
// subprocesso com --tsconfig dedicado, em vez de importar o módulo aqui.
// ---------------------------------------------------------------------------
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const run = spawnSync(
	process.execPath,
	[
		here("../node_modules/tsx/dist/cli.mjs"),
		"--tsconfig",
		here("./openfinance-sync-runner.tsconfig.json"),
		here("./openfinance-sync-runner.entry.ts"),
		connection.id,
	],
	// OPENFINANCE_RUNNER_GUARDED só é setado aqui, DEPOIS do db-guard aprovar.
	// O entry aborta se não o vir — impede rodar o sync pulando o guard.
	{ stdio: "inherit", env: { ...process.env, OPENFINANCE_RUNNER_GUARDED: "1" } },
);
process.exit(run.status ?? 1);
