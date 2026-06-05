import { and, asc, eq, ilike, not, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { cards, financialAccounts, payers, transactions } from "@/db/schema";
import { fetchPendingInboxCount } from "@/features/inbox/queries";
import type { NavbarFinanceLinks } from "@/shared/components/navigation/navbar/nav-items";
import { INITIAL_BALANCE_NOTE } from "@/shared/lib/accounts/constants";
import { db } from "@/shared/lib/db";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { getBusinessDateString } from "@/shared/utils/date";
import { safeToNumber } from "@/shared/utils/number";
import {
	type DashboardNotificationsSnapshot,
	fetchDashboardNotifications,
} from "../notifications/notifications-queries";

type DashboardNavbarData = {
	payerAvatarUrl: string | null;
	inboxPendingCount: number;
	notificationsSnapshot: DashboardNotificationsSnapshot;
	financeLinks: NavbarFinanceLinks;
};

async function fetchAdminPayerAvatarUrl(
	userId: string,
	adminPayerId: string | null,
): Promise<string | null> {
	if (!adminPayerId) {
		return null;
	}

	const payer = await db.query.payers.findFirst({
		columns: {
			avatarUrl: true,
		},
		where: and(eq(payers.id, adminPayerId), eq(payers.userId, userId)),
	});

	return payer?.avatarUrl ?? null;
}

async function fetchDashboardNavbarDataInternal(
	userId: string,
): Promise<DashboardNavbarData> {
	const currentPeriod = getBusinessDateString().slice(0, 7);
	const adminPayerId = await getAdminPayerId(userId);
	const [
		payerAvatarUrl,
		notificationsSnapshot,
		inboxPendingCount,
		activeCards,
		activeAccounts,
	] = await Promise.all([
		fetchAdminPayerAvatarUrl(userId, adminPayerId),
		fetchDashboardNotifications(userId, currentPeriod),
		fetchPendingInboxCount(userId),
		db
			.select({
				id: cards.id,
				name: cards.name,
				logo: cards.logo,
				amount: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
			})
			.from(cards)
			.leftJoin(
				transactions,
				and(
					eq(transactions.cardId, cards.id),
					eq(transactions.userId, userId),
					eq(transactions.period, currentPeriod),
				),
			)
			.where(and(eq(cards.userId, userId), not(ilike(cards.status, "inativo"))))
			.groupBy(cards.id, cards.name, cards.logo)
			.orderBy(asc(cards.name)),
		db
			.select({
				id: financialAccounts.id,
				name: financialAccounts.name,
				logo: financialAccounts.logo,
				initialBalance: financialAccounts.initialBalance,
				balanceMovements: sql<number>`
					coalesce(
						sum(
							case
								when ${transactions.note} = ${INITIAL_BALANCE_NOTE} then 0
								else ${transactions.amount}
							end
						),
						0
					)
				`,
			})
			.from(financialAccounts)
			.leftJoin(
				transactions,
				and(
					eq(transactions.accountId, financialAccounts.id),
					eq(transactions.userId, userId),
					eq(transactions.isSettled, true),
					adminPayerId ? eq(transactions.payerId, adminPayerId) : sql`false`,
				),
			)
			.where(
				and(
					eq(financialAccounts.userId, userId),
					not(ilike(financialAccounts.status, "inativa")),
				),
			)
			.groupBy(
				financialAccounts.id,
				financialAccounts.name,
				financialAccounts.logo,
				financialAccounts.initialBalance,
			)
			.orderBy(asc(financialAccounts.name)),
	]);

	return {
		payerAvatarUrl,
		inboxPendingCount,
		notificationsSnapshot,
		financeLinks: {
			cards: activeCards.map((card) => ({
				...card,
				amount: Math.abs(safeToNumber(card.amount)),
			})),
			accounts: activeAccounts.map((account) => ({
				id: account.id,
				name: account.name,
				logo: account.logo,
				amount:
					safeToNumber(account.initialBalance) +
					safeToNumber(account.balanceMovements),
			})),
		},
	};
}

export async function fetchDashboardNavbarData(userId: string) {
	"use cache";
	cacheTag(`dashboard-${userId}`);
	cacheLife({ revalidate: 3 });
	return fetchDashboardNavbarDataInternal(userId);
}
