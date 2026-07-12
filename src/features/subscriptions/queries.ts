import { and, asc, eq } from "drizzle-orm";
import {
	cards,
	categories,
	financialAccounts,
	payers,
	subscriptions,
} from "@/db/schema";
import { db } from "@/shared/lib/db";

export type SubscriptionStatus = "ativa" | "pausada" | "cancelada";

export type SubscriptionData = {
	id: string;
	name: string;
	amount: number;
	paymentMethod: string;
	billingDay: number;
	startDate: Date;
	endDate: Date | null;
	status: SubscriptionStatus;
	lastGeneratedPeriod: string | null;
	icon: string | null;
	note: string | null;
	accountId: string | null;
	accountName: string | null;
	cardId: string | null;
	cardName: string | null;
	categoryId: string | null;
	categoryName: string | null;
	payerId: string | null;
	payerName: string | null;
	createdAt: Date;
	updatedAt: Date;
};

export async function fetchSubscriptionsForUser(
	userId: string,
	status: SubscriptionStatus = "ativa",
): Promise<SubscriptionData[]> {
	const rows = await db
		.select({
			id: subscriptions.id,
			name: subscriptions.name,
			amount: subscriptions.amount,
			paymentMethod: subscriptions.paymentMethod,
			billingDay: subscriptions.billingDay,
			startDate: subscriptions.startDate,
			endDate: subscriptions.endDate,
			status: subscriptions.status,
			lastGeneratedPeriod: subscriptions.lastGeneratedPeriod,
			icon: subscriptions.icon,
			note: subscriptions.note,
			accountId: subscriptions.accountId,
			accountName: financialAccounts.name,
			cardId: subscriptions.cardId,
			cardName: cards.name,
			categoryId: subscriptions.categoryId,
			categoryName: categories.name,
			payerId: subscriptions.payerId,
			payerName: payers.name,
			createdAt: subscriptions.createdAt,
			updatedAt: subscriptions.updatedAt,
		})
		.from(subscriptions)
		.leftJoin(
			financialAccounts,
			eq(subscriptions.accountId, financialAccounts.id),
		)
		.leftJoin(cards, eq(subscriptions.cardId, cards.id))
		.leftJoin(categories, eq(subscriptions.categoryId, categories.id))
		.leftJoin(payers, eq(subscriptions.payerId, payers.id))
		.where(
			and(eq(subscriptions.userId, userId), eq(subscriptions.status, status)),
		)
		.orderBy(asc(subscriptions.billingDay), asc(subscriptions.createdAt));

	return rows.map((row) => ({
		...row,
		amount: Number(row.amount),
		status: row.status as SubscriptionStatus,
		startDate: new Date(row.startDate),
		endDate: row.endDate ? new Date(row.endDate) : null,
	}));
}
