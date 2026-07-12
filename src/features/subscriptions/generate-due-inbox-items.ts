import { and, eq } from "drizzle-orm";
import { inboxItems, subscriptions } from "@/db/schema";
import {
	getCurrentCycleBillingDate,
	toPeriodKey,
} from "@/features/subscriptions/lib/billing-date";
import { db } from "@/shared/lib/db";

/**
 * Generates a pending Inbox item for every active subscription whose current
 * billing cycle is due and hasn't been generated yet. Safe to call on every
 * dashboard load — `lastGeneratedPeriod` prevents duplicate generation within
 * the same month.
 */
export async function ensureDueSubscriptionsGenerated(
	userId: string,
): Promise<void> {
	const today = new Date();
	const currentPeriod = toPeriodKey(today);

	const activeSubscriptions = await db
		.select()
		.from(subscriptions)
		.where(
			and(eq(subscriptions.userId, userId), eq(subscriptions.status, "ativa")),
		);

	for (const subscription of activeSubscriptions) {
		if (subscription.lastGeneratedPeriod === currentPeriod) continue;

		const dueDate = getCurrentCycleBillingDate(subscription.billingDay, today);
		if (dueDate > today) continue;

		if (subscription.endDate && new Date(subscription.endDate) < dueDate) {
			continue;
		}

		await db.insert(inboxItems).values({
			userId,
			sourceApp: "assinatura",
			sourceAppName: subscription.name,
			originalTitle: subscription.name,
			originalText: subscription.note ?? subscription.name,
			notificationTimestamp: dueDate,
			parsedName: subscription.name,
			parsedAmount: subscription.amount,
			status: "pending",
			subscriptionId: subscription.id,
		});

		await db
			.update(subscriptions)
			.set({ lastGeneratedPeriod: currentPeriod, updatedAt: new Date() })
			.where(eq(subscriptions.id, subscription.id));
	}
}
