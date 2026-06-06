import { connection } from "next/server";
import { BudgetAlertBanner } from "@/features/dashboard/components/budget-alert-banner";
import { DashboardGridEditable } from "@/features/dashboard/components/dashboard-grid-editable";
import { DashboardMetricsCards } from "@/features/dashboard/components/dashboard-metrics-cards";
import { DashboardWelcome } from "@/features/dashboard/components/dashboard-welcome";
import { extractDashboardLogoNames } from "@/features/dashboard/lib/extract-logo-names";
import { fetchBudgetAlertsForBanner } from "@/features/dashboard/notifications/budget-banner-queries";
import { fetchDashboardPageData } from "@/features/dashboard/page-data-queries";
import { getSingleParam } from "@/features/transactions/lib/page-helpers";
import { LogoPrefetchProvider } from "@/shared/components/entity-avatar";
import MonthNavigation from "@/shared/components/month-picker/month-navigation";
import { getUser } from "@/shared/lib/auth/server";
import { prefetchLogoMappings } from "@/shared/lib/logo/prefetch-server";
import { parsePeriodParam } from "@/shared/utils/period";

type PageSearchParams = Promise<Record<string, string | string[] | undefined>>;

type PageProps = {
  searchParams?: PageSearchParams;
};

export default async function Page({ searchParams }: PageProps) {
  await connection();
  const user = await getUser();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const periodoParam = getSingleParam(resolvedSearchParams, "periodo");
  const { period: selectedPeriod } = parsePeriodParam(periodoParam);

  const [{ dashboardData, preferences, quickActionOptions }, budgetAlerts] =
    await Promise.all([
      fetchDashboardPageData(user.id, selectedPeriod),
      fetchBudgetAlertsForBanner(user.id, selectedPeriod),
    ]);

  const { dashboardWidgets } = preferences;
  const adminPayerSlug =
    quickActionOptions.payerOptions.find(
      (option) => option.value === quickActionOptions.defaultPayerId,
    )?.slug ?? null;

  const logoMappings = await prefetchLogoMappings(
    user.id,
    extractDashboardLogoNames(dashboardData),
  );

  return (
    <main className="flex flex-col gap-4">
      <DashboardWelcome name={user.name} />
      <MonthNavigation />
      <BudgetAlertBanner alerts={budgetAlerts} />
      <DashboardMetricsCards
        metrics={dashboardData.metrics}
        period={selectedPeriod}
        adminPayerSlug={adminPayerSlug}
      />
      <LogoPrefetchProvider mappings={logoMappings}>
        <DashboardGridEditable
          data={dashboardData}
          period={selectedPeriod}
          initialPreferences={dashboardWidgets}
          quickActionOptions={quickActionOptions}
        />
      </LogoPrefetchProvider>
    </main>
  );
}