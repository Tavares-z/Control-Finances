// Cria uma conexão Open Finance de TESTE, NÃO-vinculada (conta_id /
// pluggy_account_id null), no banco apontado pelo .env — que é o STAGING
// (sakura), não prod. Reproduz o estado das conexões reais de prod ("Nunca
// sincronizada" por accountId null) para exercitar a UI de vínculo (F1.1).
//
// NÃO passa pelo db-guard (que só cobre migrate/push), mas escreve no mesmo
// banco do .env local = staging. NÃO rode com .env de prod.
//
// Uso (Windows, chamando tsx direto p/ evitar o postinstall):
//   node node_modules/tsx/dist/cli.mjs scripts/seed-openfinance-test-connection.ts --userId=<id> --itemId=<pluggyItemId>

import { config } from "dotenv";
import { openFinanceConnections } from "@/db/schema";
import { db } from "@/shared/lib/db";

config();

function arg(name: string): string | undefined {
	const prefix = `--${name}=`;
	return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const userId = arg("userId");
const pluggyItemId = arg("itemId");

if (!userId || !pluggyItemId) {
	console.error(
		"Uso: ... seed-openfinance-test-connection.ts --userId=<id> --itemId=<pluggyItemId>",
	);
	process.exit(1);
}

const dbHost = new URL(process.env.DATABASE_URL ?? "postgres://x").hostname;
console.log(`Alvo (host do .env): ${dbHost}`);
if (dbHost.includes("kodama")) {
	console.error("ABORTADO: host parece ser prod (kodama). Não seedar prod.");
	process.exit(1);
}

const [row] = await db
	.insert(openFinanceConnections)
	.values({
		userId,
		pluggyItemId,
		connectorName: "MeuPluggy (teste F1.1)",
		// accountId / pluggyAccountId ficam NULL de propósito — é o estado a testar.
	})
	.onConflictDoUpdate({
		target: [
			openFinanceConnections.userId,
			openFinanceConnections.pluggyItemId,
		],
		// Idempotente: reseta o vínculo para null se a conexão já existir, para
		// re-testar o fluxo do zero.
		set: {
			accountId: null,
			pluggyAccountId: null,
			lastSyncedAt: null,
			connectorName: "MeuPluggy (teste F1.1)",
			updatedAt: new Date(),
		},
	})
	.returning({ id: openFinanceConnections.id });

console.log(`Conexão de teste pronta (não-vinculada): ${row.id}`);
process.exit(0);
