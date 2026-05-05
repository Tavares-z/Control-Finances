import { RiCheckboxCircleFill, RiExternalLinkLine } from "@remixicon/react";
import Link from "next/link";
import {
	buildBillStatusLabel,
	buildBillWidgetStatusLabel,
	isBillOverdue,
} from "@/features/dashboard/bills/bills-helpers";
import type { DashboardBill } from "@/features/dashboard/bills/bills-queries";
import { EstablishmentLogo } from "@/shared/components/entity-avatar";
import MoneyValues from "@/shared/components/money-values";
import { Button } from "@/shared/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { formatPeriodForUrl, getCurrentPeriod } from "@/shared/utils/period";
import { cn } from "@/shared/utils/ui";

type BillListItemProps = {
	bill: DashboardBill;
	period?: string;
	onPay: (billId: string) => void;
};

function buildTransactionsHref(name: string, period?: string): string {
	const params = new URLSearchParams({ q: name });
	const current = getCurrentPeriod();
	if (period && period !== current) {
		params.set("periodo", formatPeriodForUrl(period));
	}
	return `/transactions?${params.toString()}`;
}

export function BillListItem({ bill, period, onPay }: BillListItemProps) {
	const statusLabel = buildBillWidgetStatusLabel(bill);
	const absoluteStatusLabel = buildBillStatusLabel(bill);
	const overdue = isBillOverdue(bill);
	const statusTooltipLabel =
		statusLabel && statusLabel !== absoluteStatusLabel
			? absoluteStatusLabel
			: null;
	const href = buildTransactionsHref(bill.name, period);

	return (
		<li className="flex items-center justify-between transition-all duration-300 py-1.5">
			<div className="flex min-w-0 flex-1 items-center gap-2 py-0.5">
				<EstablishmentLogo name={bill.name} size={37} />

				<div className="min-w-0">
					<Link
						href={href}
						className="inline-flex max-w-full items-center gap-1 text-sm font-medium text-foreground underline-offset-2 hover:text-primary hover:underline"
					>
						<span className="truncate">{bill.name}</span>
						<RiExternalLinkLine
							className="size-3 shrink-0 text-muted-foreground"
							aria-hidden
						/>
					</Link>
					<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
						{statusLabel ? (
							statusTooltipLabel ? (
								<Tooltip>
									<TooltipTrigger asChild>
										<span
											className={cn(
												"cursor-help rounded-full py-0.5",
												bill.isSettled && "text-success font-semibold",
											)}
										>
											{statusLabel}
										</span>
									</TooltipTrigger>
									<TooltipContent side="top">
										{statusTooltipLabel}
									</TooltipContent>
								</Tooltip>
							) : (
								<span
									className={cn(
										"rounded-full py-0.5",
										bill.isSettled && "text-success font-semibold",
									)}
								>
									{statusLabel}
								</span>
							)
						) : null}
					</div>
				</div>
			</div>

			<div className="flex shrink-0 flex-col items-end">
				<MoneyValues className="font-medium" amount={bill.amount} />
				<Button
					type="button"
					size="sm"
					variant="link"
					className="h-auto p-0 disabled:opacity-100"
					disabled={bill.isSettled}
					onClick={() => onPay(bill.id)}
				>
					{bill.isSettled ? (
						<span className="flex items-center gap-0.5 text-success">
							<RiCheckboxCircleFill className="size-3.5" /> Pago
						</span>
					) : overdue ? (
						<span className="overdue-blink">
							<span className="overdue-blink-primary text-destructive">
								Atrasado
							</span>
							<span className="overdue-blink-secondary">Pagar</span>
						</span>
					) : (
						"Pagar"
					)}
				</Button>
			</div>
		</li>
	);
}
