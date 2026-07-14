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
 *
 * Subscriptions billed to a card (`cardId` set) are skipped: that charge will
 * already land in the invoice once the user imports/reconciles it from the
 * bank, so generating an Inbox item too would double-count the expense.
 * `lastGeneratedPeriod` is still stamped so a later cardId removal doesn't
 * retroactively generate past periods.
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

		if (subscription.cardId) {
			await db
				.update(subscriptions)
				.set({ lastGeneratedPeriod: currentPeriod, updatedAt: new Date() })
				.where(eq(subscriptions.id, subscription.id));
			continue;
		}

		const dueDate = getCurrentCycleBillingDate(subscription.billingDay, today);
		if (dueDate > today) continue;

		if (subscription.endDate && new Date(subscription.endDate) < dueDate) {
			continue;
		}

		const [inserted] = await db
			.insert(inboxItems)
			.values({
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
				subscriptionPeriod: currentPeriod,
			})
			.onConflictDoNothing({
				target: [inboxItems.subscriptionId, inboxItems.subscriptionPeriod],
			})
			.returning({ id: inboxItems.id });

		if (!inserted) continue;

		await db
			.update(subscriptions)
			.set({ lastGeneratedPeriod: currentPeriod, updatedAt: new Date() })
			.where(eq(subscriptions.id, subscription.id));
	}
}
