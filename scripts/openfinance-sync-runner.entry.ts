/**
 * Entry TS interno do openfinance-sync-runner. NÃO rodar direto — é invocado
 * pelo `openfinance-sync-runner.mjs` via tsx (com o tsconfig irmão que mapeia
 * `@/*` e stuba `server-only`). Recebe o connectionId como argv[2] e imprime o
 * SyncResult cru. O ambiente (DATABASE_URL, credenciais Pluggy) é herdado do
 * processo pai.
 */
import { syncOpenFinanceConnection } from "@/features/openfinance/sync";

// async IIFE em vez de top-level await: o tsx pode transpilar este .ts como CJS
// (onde top-level await não é suportado), dependendo do "type" do package.json.
async function main() {
	// Não pode rodar fora do runner — é o runner quem executa o db-guard antes
	// e injeta este carimbo. Sem ele, o sync rodaria pulando a salvaguarda.
	if (process.env.OPENFINANCE_RUNNER_GUARDED !== "1") {
		console.error(
			"openfinance-sync-runner.entry: execução direta bloqueada. Rode via " +
				"`node scripts/openfinance-sync-runner.mjs` (que executa o db-guard antes).",
		);
		process.exit(1);
	}

	const connectionId = process.argv[2];
	if (!connectionId) {
		console.error("openfinance-sync-runner.entry: connectionId ausente.");
		process.exit(1);
	}

	const result = await syncOpenFinanceConnection(connectionId);
	console.log("=== SyncResult ===");
	console.log(JSON.stringify(result, null, 2));
	process.exit(0);
}

main().catch((error) => {
	console.error("openfinance-sync-runner.entry: erro inesperado:", error);
	process.exit(1);
});
