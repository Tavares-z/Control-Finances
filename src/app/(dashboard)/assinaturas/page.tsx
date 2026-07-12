import { connection } from "next/server";
import { fetchAllAccountsForUser } from "@/features/accounts/queries";
import { fetchAllCardsForUser } from "@/features/cards/queries";
import { fetchCategoriesForUser } from "@/features/categories/queries";
import { fetchPayersForUser } from "@/features/payers/queries";
import { SubscriptionsPage } from "@/features/subscriptions/components/subscriptions-page";
import { fetchSubscriptionsForUser } from "@/features/subscriptions/queries";
import { getUserId } from "@/shared/lib/auth/server";

export default async function Page() {
	await connection();
	const userId = await getUserId();

	const [
		activeSubscriptions,
		pausedSubscriptions,
		cancelledSubscriptions,
		{ activeAccounts },
		{ activeCards },
		categories,
		{ payers },
	] = await Promise.all([
		fetchSubscriptionsForUser(userId, "ativa"),
		fetchSubscriptionsForUser(userId, "pausada"),
		fetchSubscriptionsForUser(userId, "cancelada"),
		fetchAllAccountsForUser(userId),
		fetchAllCardsForUser(userId),
		fetchCategoriesForUser(userId),
		fetchPayersForUser(userId),
	]);

	return (
		<main className="flex flex-col gap-6">
			<SubscriptionsPage
				activeSubscriptions={activeSubscriptions}
				pausedSubscriptions={pausedSubscriptions}
				cancelledSubscriptions={cancelledSubscriptions}
				accounts={activeAccounts.map((account) => ({
					id: account.id,
					name: account.name,
				}))}
				cards={activeCards.map((card) => ({ id: card.id, name: card.name }))}
				categories={categories.map((category) => ({
					id: category.id,
					name: category.name,
				}))}
				payers={payers.map((payer) => ({ id: payer.id, name: payer.name }))}
			/>
		</main>
	);
}
