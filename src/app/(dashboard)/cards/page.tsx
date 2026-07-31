import { connection } from "next/server";
import { CardsPage } from "@/features/cards/components/cards-page";
import { fetchAllCardsForUser } from "@/features/cards/queries";
import { listOpenFinanceConnections } from "@/features/openfinance/queries";
import { getUserId } from "@/shared/lib/auth/server";

export default async function Page() {
	await connection();
	const userId = await getUserId();
	const { activeCards, archivedCards, accounts, logoOptions } =
		await fetchAllCardsForUser(userId);

	// Fase 2 (Open Finance p/ cartões): gate server-side pela mesma flag da aba de
	// Configurações. Sem ela, o botão de vínculo não aparece e nada é carregado.
	// Só precisamos saber SE há conexões (o dialog busca os cartões Pluggy de cada
	// uma sob demanda, para rotulá-los pelo nome do cartão — ver o dialog).
	const openFinanceEnabled =
		process.env.OPENFINANCE_ENABLED?.trim().toLowerCase() === "true";
	const openFinanceHasConnections = openFinanceEnabled
		? (await listOpenFinanceConnections(userId)).length > 0
		: false;

	return (
		<main className="flex flex-col gap-6">
			<CardsPage
				cards={activeCards}
				archivedCards={archivedCards}
				accounts={accounts}
				logoOptions={logoOptions}
				openFinanceEnabled={openFinanceEnabled}
				openFinanceHasConnections={openFinanceHasConnections}
			/>
		</main>
	);
}
