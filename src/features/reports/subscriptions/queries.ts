import { fetchSubscriptionsForUser } from "@/features/subscriptions/queries";

type SubscriptionProjectionItem = {
	id: string;
	name: string;
	icon: string | null;
	categoryName: string | null;
	monthlyAmount: number;
	monthsRemaining: number;
	projectedTotal: number;
};

type SubscriptionCategoryTotal = {
	categoryName: string;
	total: number;
};

export type SubscriptionsAnnualProjection = {
	subscriptions: SubscriptionProjectionItem[];
	annualTotal: number;
	monthlyTotal: number;
	byCategory: SubscriptionCategoryTotal[];
};

const monthPeriodKey = (date: Date) =>
	`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

/**
 * Projects the next 12 months of spend for the user's active subscriptions,
 * truncating a subscription's contribution once its `endDate` month passes.
 */
export async function fetchSubscriptionsAnnualProjection(
	userId: string,
): Promise<SubscriptionsAnnualProjection> {
	const activeSubscriptions = await fetchSubscriptionsForUser(userId, "ativa");

	const today = new Date();
	const endDatePeriods = activeSubscriptions.map((s) =>
		s.endDate ? monthPeriodKey(s.endDate) : null,
	);

	const items: SubscriptionProjectionItem[] = activeSubscriptions.map(
		(subscription, index) => {
			const endPeriod = endDatePeriods[index];
			let monthsRemaining = 0;
			for (let i = 0; i < 12; i++) {
				const monthDate = new Date(
					today.getFullYear(),
					today.getMonth() + i,
					1,
				);
				const period = monthPeriodKey(monthDate);
				if (endPeriod && period > endPeriod) break;
				monthsRemaining += 1;
			}

			return {
				id: subscription.id,
				name: subscription.name,
				icon: subscription.icon,
				categoryName: subscription.categoryName,
				monthlyAmount: subscription.amount,
				monthsRemaining,
				projectedTotal: subscription.amount * monthsRemaining,
			};
		},
	);

	const annualTotal = items.reduce((sum, item) => sum + item.projectedTotal, 0);
	const monthlyTotal = items
		.filter((item) => item.monthsRemaining > 0)
		.reduce((sum, item) => sum + item.monthlyAmount, 0);

	const categoryTotals = new Map<string, number>();
	for (const item of items) {
		const key = item.categoryName ?? "Sem categoria";
		categoryTotals.set(
			key,
			(categoryTotals.get(key) ?? 0) + item.projectedTotal,
		);
	}
	const byCategory = Array.from(categoryTotals.entries())
		.map(([categoryName, total]) => ({ categoryName, total }))
		.sort((a, b) => b.total - a.total);

	const sortedSubscriptions = [...items].sort(
		(a, b) => b.projectedTotal - a.projectedTotal,
	);

	return {
		subscriptions: sortedSubscriptions,
		annualTotal,
		monthlyTotal,
		byCategory,
	};
}
