"use client";

import { useState, useTransition } from "react";
import {
    RiAlertLine,
    RiArrowRightSLine,
    RiCloseLine,
    RiErrorWarningLine,
} from "@remixicon/react";
import Link from "next/link";
import { dismissBudgetNotificationAction } from "@/features/dashboard/notifications/budget-banner-actions";
import type { BudgetAlertItem } from "@/features/dashboard/notifications/budget-banner-queries";

type Props = {
    alerts: BudgetAlertItem[];
};

export function BudgetAlertBanner({ alerts: initialAlerts }: Props) {
    const [alerts, setAlerts] = useState(initialAlerts);
    const [, startTransition] = useTransition();

    if (alerts.length === 0) return null;

    const handleDismiss = (
        notificationKey: string,
        fingerprint: string,
    ) => {
        setAlerts((prev) =>
            prev.filter((a) => a.notificationKey !== notificationKey),
        );
        startTransition(async () => {
            await dismissBudgetNotificationAction({ notificationKey, fingerprint });
        });
    };

    return (
        <div className="flex flex-col gap-2">
            {alerts.map((alert) => {
                const isExceeded = alert.status === "exceeded";
                return (
                    <div
                        key={alert.notificationKey}
                        className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${isExceeded
                                ? "border-destructive/25 bg-destructive/5"
                                : "border-amber-500/25 bg-amber-500/5"
                            }`}
                    >
                        {isExceeded ? (
                            <RiErrorWarningLine className="size-4 shrink-0 text-destructive" />
                        ) : (
                            <RiAlertLine className="size-4 shrink-0 text-amber-500" />
                        )}

                        <p className="flex-1 min-w-0 text-foreground">
                            <span className="font-medium">{alert.categoryName}</span>
                            <span className="text-muted-foreground">
                                {isExceeded
                                    ? ` — orçamento excedido (${Math.round(alert.usedPercentage)}% utilizado)`
                                    : ` — ${Math.round(alert.usedPercentage)}% do orçamento utilizado`}
                            </span>
                        </p>

                        <div className="flex items-center gap-1 shrink-0">
                            <Link
                                href={alert.href}
                                className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                            >
                                Ver
                                <RiArrowRightSLine className="size-3.5" />
                            </Link>
                            <button
                                type="button"
                                onClick={() =>
                                    handleDismiss(alert.notificationKey, alert.fingerprint)
                                }
                                className="ml-1 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                                aria-label={`Dispensar alerta de ${alert.categoryName}`}
                            >
                                <RiCloseLine className="size-4" />
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}