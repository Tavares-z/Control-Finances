import { and, eq, inArray, ne, sql } from "drizzle-orm";
import {
  budgets,
  categories,
  dashboardNotificationStates,
  transactions,
} from "@/db/schema";
import { db } from "@/shared/lib/db";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { safeToNumber as toNumber } from "@/shared/utils/number";
import { formatPeriodForUrl } from "@/shared/utils/period";

const BUDGET_CRITICAL_THRESHOLD = 80;

const buildBudgetNotificationKey = (
  categoryId: string | null,
  budgetId: string,
  period: string,
) => (categoryId ? `budget-${categoryId}-${period}` : `budget-${budgetId}`);

export type BudgetAlertItem = {
  notificationKey: string;
  fingerprint: string;
  categoryName: string;
  budgetAmount: number;
  spentAmount: number;
  usedPercentage: number;
  status: "exceeded" | "critical";
  href: string;
};

export async function fetchBudgetAlertsForBanner(
  userId: string,
  period: string,
): Promise<BudgetAlertItem[]> {
  const adminPayerId = await getAdminPayerId(userId);

  const budgetJoinConditions = [
    eq(transactions.categoryId, budgets.categoryId),
    eq(transactions.userId, budgets.userId),
    eq(transactions.period, budgets.period),
    eq(transactions.transactionType, "Despesa"),
    ne(transactions.condition, "cancelado"),
  ] as ReturnType<typeof eq>[];
  if (adminPayerId) {
    budgetJoinConditions.push(eq(transactions.payerId, adminPayerId));
  }

  const budgetRows = await db
    .select({
      orcamentoId: budgets.id,
      categoryId: budgets.categoryId,
      budgetAmount: budgets.amount,
      period: budgets.period,
      categoriaName: categories.name,
      spentAmount: sql<number>`COALESCE(SUM(ABS(${transactions.amount})), 0)`,
    })
    .from(budgets)
    .innerJoin(categories, eq(budgets.categoryId, categories.id))
    .leftJoin(transactions, and(...budgetJoinConditions))
    .where(and(eq(budgets.userId, userId), eq(budgets.period, period)))
    .groupBy(budgets.id, budgets.amount, categories.name);

  const alerts: BudgetAlertItem[] = [];

  for (const row of budgetRows) {
    const budgetAmount = toNumber(row.budgetAmount);
    const spentAmount = toNumber(row.spentAmount);
    if (budgetAmount <= 0) continue;

    const usedPercentage = (spentAmount / budgetAmount) * 100;
    if (usedPercentage < BUDGET_CRITICAL_THRESHOLD) continue;

    const status: "exceeded" | "critical" =
      usedPercentage >= 100 ? "exceeded" : "critical";
    const notificationKey = buildBudgetNotificationKey(
      row.categoryId,
      row.orcamentoId,
      row.period,
    );

    alerts.push({
      notificationKey,
      fingerprint: status,
      categoryName: row.categoriaName,
      budgetAmount,
      spentAmount,
      usedPercentage,
      status,
      href: `/budgets?periodo=${formatPeriodForUrl(row.period)}`,
    });
  }

  if (alerts.length === 0) return [];

  // Buscar estados de dismiss persistidos
  const notificationKeys = alerts.map((a) => a.notificationKey);
  const persistedStates = await db
    .select({
      notificationKey: dashboardNotificationStates.notificationKey,
      fingerprint: dashboardNotificationStates.fingerprint,
      archivedAt: dashboardNotificationStates.archivedAt,
    })
    .from(dashboardNotificationStates)
    .where(
      and(
        eq(dashboardNotificationStates.userId, userId),
        inArray(
          dashboardNotificationStates.notificationKey,
          notificationKeys,
        ),
      ),
    );

  const stateByKey = new Map(
    persistedStates.map((s) => [s.notificationKey, s]),
  );

  return alerts
    .filter((alert) => {
      const state = stateByKey.get(alert.notificationKey);
      if (!state) return true; // nunca dismissado
      if (state.fingerprint !== alert.fingerprint) return true; // status piorou — mostra de novo
      return state.archivedAt === null; // não arquivado
    })
    .sort((a, b) => {
      if (a.status === "exceeded" && b.status !== "exceeded") return -1;
      if (a.status !== "exceeded" && b.status === "exceeded") return 1;
      return b.usedPercentage - a.usedPercentage;
    });
}