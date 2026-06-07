import { connection } from "next/server";
import { fetchAllAccountsForUser } from "@/features/accounts/queries";
import { GoalsPage } from "@/features/goals/components/goals-page";
import { fetchGoalsForUser } from "@/features/goals/queries";
import { getUserId } from "@/shared/lib/auth/server";

export default async function Page() {
	await connection();
	const userId = await getUserId();

	const [activeGoals, completedGoals, archivedGoals, { activeAccounts }] =
		await Promise.all([
			fetchGoalsForUser(userId, "ativa"),
			fetchGoalsForUser(userId, "concluida"),
			fetchGoalsForUser(userId, "arquivada"),
			fetchAllAccountsForUser(userId),
		]);

	return (
		<main className="flex flex-col gap-6">
			<GoalsPage
				activeGoals={activeGoals}
				completedGoals={completedGoals}
				archivedGoals={archivedGoals}
				accounts={activeAccounts}
			/>
		</main>
	);
}