import { and, eq, ne, sql } from "drizzle-orm";
import { financialAccounts, transactions } from "@/db/schema";
import { fetchDashboardAccounts } from "@/features/dashboard/lib/accounts-queries";
import { excludeTransactionsFromExcludedAccounts } from "@/features/dashboard/lib/transaction-filters";
import { getUpcomingBillingDates } from "@/features/subscriptions/lib/billing-date";
import { fetchSubscriptionsForUser } from "@/features/subscriptions/queries";
import { db } from "@/shared/lib/db";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import {
	addDaysToDateOnly,
	getBusinessDateString,
	getBusinessTodayDate,
	toDateOnlyString,
} from "@/shared/utils/date";
import { safeToNumber as toNumber } from "@/shared/utils/number";

export type CashFlowBucketDay = 7 | 30 | 60 | 90;

const CASH_FLOW_BUCKETS: CashFlowBucketDay[] = [7, 30, 60, 90];
const CASH_FLOW_HORIZON_DAYS = 90;

export type CashFlowProjectionPoint = {
	bucket: CashFlowBucketDay;
	date: string;
	income: number;
	expense: number;
	projectedBalance: number;
};

export type CashFlowSourceItem = {
	id: string;
	name: string;
	amount: number;
	date: string;
	source: "transaction" | "subscription";
};

export type CashFlowSnapshot = {
	currentBalance: number;
	projections: CashFlowProjectionPoint[];
	subscriptionsIncluded: number;
	upcomingItems: CashFlowSourceItem[];
	warnings: string[];
};

function emptySnapshot(currentBalance = 0): CashFlowSnapshot {
	return {
		currentBalance,
		projections: CASH_FLOW_BUCKETS.map((bucket) => ({
			bucket,
			date: getBusinessDateString(),
			income: 0,
			expense: 0,
			projectedBalance: currentBalance,
		})),
		subscriptionsIncluded: 0,
		upcomingItems: [],
		warnings: [],
	};
}

export async function fetchDashboardCashFlow(
	userId: string,
): Promise<CashFlowSnapshot> {
	const adminPayerId = await getAdminPayerId(userId);
	const { totalBalance } = await fetchDashboardAccounts(userId);

	if (!adminPayerId) {
		return emptySnapshot(totalBalance);
	}

	const today = getBusinessTodayDate();
	const todayString = getBusinessDateString(today);
	const horizonEnd =
		addDaysToDateOnly(todayString, CASH_FLOW_HORIZON_DAYS) ?? todayString;

	const transactionRows = await db
		.select({
			id: transactions.id,
			name: transactions.name,
			amount: transactions.amount,
			transactionType: transactions.transactionType,
			dueDate: transactions.dueDate,
			purchaseDate: transactions.purchaseDate,
		})
		.from(transactions)
		.leftJoin(
			financialAccounts,
			eq(transactions.accountId, financialAccounts.id),
		)
		.where(
			and(
				eq(transactions.userId, userId),
				eq(transactions.payerId, adminPayerId),
				eq(transactions.isSettled, false),
				ne(transactions.transactionType, "Transferência"),
				excludeTransactionsFromExcludedAccounts(),
				sql`coalesce(${transactions.dueDate}, ${transactions.purchaseDate}) >= ${todayString}`,
				sql`coalesce(${transactions.dueDate}, ${transactions.purchaseDate}) <= ${horizonEnd}`,
			),
		);

	const transactionItems: CashFlowSourceItem[] = transactionRows.reduce<
		CashFlowSourceItem[]
	>((items, row) => {
		const date = toDateOnlyString(row.dueDate ?? row.purchaseDate);
		if (!date) {
			return items;
		}
		const rawAmount = toNumber(row.amount);
		const signedAmount =
			row.transactionType === "Receita" ? rawAmount : -Math.abs(rawAmount);
		items.push({
			id: row.id,
			name: row.name,
			amount: signedAmount,
			date,
			source: "transaction",
		});
		return items;
	}, []);

	const activeSubscriptions = await fetchSubscriptionsForUser(userId, "ativa");

	const warnings: string[] = [];
	const subscriptionItems: CashFlowSourceItem[] = [];

	for (const subscription of activeSubscriptions) {
		const startsWithinHorizon =
			toDateOnlyString(subscription.startDate) !== null &&
			(toDateOnlyString(subscription.startDate) as string) <= horizonEnd;
		if (!startsWithinHorizon) {
			continue;
		}
		const endDateString = toDateOnlyString(subscription.endDate);
		if (endDateString && endDateString < todayString) {
			continue;
		}

		const upcomingDates = getUpcomingBillingDates(
			subscription.billingDay,
			today,
			CASH_FLOW_HORIZON_DAYS,
		);

		for (const billingDate of upcomingDates) {
			const billingDateString = toDateOnlyString(billingDate);
			if (!billingDateString) {
				continue;
			}
			if (endDateString && billingDateString > endDateString) {
				continue;
			}
			subscriptionItems.push({
				id: subscription.id,
				name: subscription.name,
				amount: -Math.abs(subscription.amount),
				date: billingDateString,
				source: "subscription",
			});
		}
	}

	const allItems = [...transactionItems, ...subscriptionItems].sort((a, b) =>
		a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
	);

	const projections: CashFlowProjectionPoint[] = CASH_FLOW_BUCKETS.map(
		(bucket) => {
			const bucketDate = addDaysToDateOnly(todayString, bucket) ?? todayString;
			const itemsUntilBucket = allItems.filter(
				(item) => item.date <= bucketDate,
			);
			const income = itemsUntilBucket
				.filter((item) => item.amount > 0)
				.reduce((sum, item) => sum + item.amount, 0);
			const expense = itemsUntilBucket
				.filter((item) => item.amount < 0)
				.reduce((sum, item) => sum + Math.abs(item.amount), 0);

			return {
				bucket,
				date: bucketDate,
				income,
				expense,
				projectedBalance: totalBalance + income - expense,
			};
		},
	);

	return {
		currentBalance: totalBalance,
		projections,
		subscriptionsIncluded: new Set(subscriptionItems.map((item) => item.id))
			.size,
		upcomingItems: allItems.slice(0, 10),
		warnings,
	};
}
