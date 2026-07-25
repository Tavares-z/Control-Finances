#!/usr/bin/env node
// Salvaguarda: impede rodar comandos destrutivos (db:migrate / db:push)
// contra um banco que NÃO seja dev/staging conhecido.
//
// Estratégia: ALLOWLIST. Só passa se o host da DATABASE_URL estiver na lista
// abaixo. Qualquer outro host (produção, URL nova colada errada, etc.) é
// bloqueado por padrão — inclusive prod (kodama.proxy.rlwy.net).
//
// Escape hatch consciente: DB_ALLOW_UNSAFE=1 pula a checagem (use só quando
// você REALMENTE quer mirar prod de propósito).

import { config } from "dotenv";

config(); // carrega .env

const ALLOWED_HOSTS = new Set([
	"localhost",
	"127.0.0.1",
	"db", // host do docker-compose, caso um dia rode container local
	"sakura.proxy.rlwy.net", // staging (projeto lucid-wisdom no Railway)
]);

function fail(message) {
	console.error("\n\x1b[31m✖ db-guard: comando BLOQUEADO\x1b[0m");
	console.error(`  ${message}\n`);
	console.error(
		"  Se você REALMENTE quer rodar contra este banco, prefixe com DB_ALLOW_UNSAFE=1.\n",
	);
	process.exit(1);
}

if (process.env.DB_ALLOW_UNSAFE === "1") {
	console.warn(
		"\x1b[33m⚠ db-guard: DB_ALLOW_UNSAFE=1 — checagem de destino PULADA.\x1b[0m",
	);
	process.exit(0);
}

const url = process.env.DATABASE_URL;

if (!url) {
	fail("DATABASE_URL não está definida.");
}

let host;
try {
	host = new URL(url).hostname;
} catch {
	fail(`DATABASE_URL não é uma URL válida: ${url}`);
}

if (!ALLOWED_HOSTS.has(host)) {
	fail(
		`host "${host}" não está na allowlist de dev/staging.\n` +
			`  Allowlist atual: ${[...ALLOWED_HOSTS].join(", ")}`,
	);
}

console.log(`\x1b[32m✓ db-guard: destino "${host}" liberado.\x1b[0m`);
process.exit(0);
