import { and, asc, eq, sql } from "drizzle-orm";
import { financialAccounts, goals, transactions } from "@/db/schema";
import { INITIAL_BALANCE_NOTE } from "@/shared/lib/accounts/constants";
import { db } from "@/shared/lib/db";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";

export type GoalStatus = "ativa" | "concluida" | "arquivada";

export type GoalData = {
	id: string;
	name: string;
	targetAmount: number;
	currentAmount: number;
	remainingAmount: number;
	usedPercentage: number;
	isCompleted: boolean;
	deadline: Date | null;
	icon: string | null;
	note: string | null;
	status: string;
	accountId: string | null;
	accountName: string | null;
	createdAt: Date;
	updatedAt: Date;
};

export async function fetchGoalsForUser(
	userId: string,
	status: GoalStatus = "ativa",
): Promise<GoalData[]> {
	const adminPayerId = await getAdminPayerId(userId);

	const rows = await db
		.select({
			id: goals.id,
			name: goals.name,
			targetAmount: goals.targetAmount,
			deadline: goals.deadline,
			icon: goals.icon,
			note: goals.note,
			status: goals.status,
			accountId: goals.accountId,
			accountName: financialAccounts.name,
			initialBalance: financialAccounts.initialBalance,
			createdAt: goals.createdAt,
			updatedAt: goals.updatedAt,
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
		.from(goals)
		.leftJoin(financialAccounts, eq(goals.accountId, financialAccounts.id))
		.leftJoin(
			transactions,
			and(
				eq(transactions.accountId, financialAccounts.id),
				eq(transactions.userId, userId),
				eq(transactions.isSettled, true),
				adminPayerId ? eq(transactions.payerId, adminPayerId) : sql`false`,
			),
		)
		.where(and(eq(goals.userId, userId), eq(goals.status, status)))
		.groupBy(
			goals.id,
			goals.name,
			goals.targetAmount,
			goals.deadline,
			goals.icon,
			goals.note,
			goals.status,
			goals.accountId,
			goals.createdAt,
			goals.updatedAt,
			financialAccounts.name,
			financialAccounts.initialBalance,
		)
		.orderBy(asc(goals.deadline), asc(goals.createdAt));

	return rows.map((row) => {
		const currentAmount =
			Number(row.initialBalance ?? 0) + Number(row.balanceMovements ?? 0);
		const targetAmount = Number(row.targetAmount);
		const remainingAmount = Math.max(targetAmount - currentAmount, 0);
		const usedPercentage =
			targetAmount > 0
				? Math.min((currentAmount / targetAmount) * 100, 100)
				: 0;

		return {
			id: row.id,
			name: row.name,
			targetAmount,
			currentAmount,
			remainingAmount,
			usedPercentage,
			isCompleted: currentAmount >= targetAmount,
			deadline: row.deadline ? new Date(row.deadline) : null,
			icon: row.icon,
			note: row.note,
			status: row.status,
			accountId: row.accountId,
			accountName: row.accountName ?? null,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		};
	});
}