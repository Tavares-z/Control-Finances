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
	const openFinanceEnabled =
		process.env.OPENFINANCE_ENABLED?.trim().toLowerCase() === "true";
	const openFinanceConnections = openFinanceEnabled
		? (await listOpenFinanceConnections(userId)).map((c) => ({
				id: c.id,
				connectorName: c.connectorName,
			}))
		: [];

	return (
		<main className="flex flex-col gap-6">
			<CardsPage
				cards={activeCards}
				archivedCards={archivedCards}
				accounts={accounts}
				logoOptions={logoOptions}
				openFinanceEnabled={openFinanceEnabled}
				openFinanceConnections={openFinanceConnections}
			/>
		</main>
	);
}
