"use client";

import type { CashFlowSnapshot } from "@/features/dashboard/cash-flow/cash-flow-queries";
import { cn } from "@/shared/utils/ui";

const formatCurrency = (value: number) =>
	new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(value);

interface CashFlowWidgetProps {
	data: CashFlowSnapshot;
}

export function CashFlowWidget({ data }: CashFlowWidgetProps) {
	const buckets = data.projections.filter((p) => p.bucket !== 7);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-baseline justify-between">
				<span className="text-xs text-muted-foreground">Saldo atual</span>
				<span className="text-sm font-semibold">
					{formatCurrency(data.currentBalance)}
				</span>
			</div>
			<div className="grid grid-cols-3 gap-3">
				{buckets.map((bucket) => (
					<div key={bucket.bucket} className="flex flex-col gap-1">
						<span className="text-xs text-muted-foreground">
							{bucket.bucket} dias
						</span>
						<span
							className={cn(
								"text-sm font-semibold",
								bucket.projectedBalance < 0 && "text-destructive",
							)}
						>
							{formatCurrency(bucket.projectedBalance)}
						</span>
					</div>
				))}
			</div>
			{data.warnings.length > 0 && (
				<div className="flex flex-col gap-1">
					{data.warnings.map((warning) => (
						<p key={warning} className="text-xs text-muted-foreground">
							{warning}
						</p>
					))}
				</div>
			)}
		</div>
	);
}
