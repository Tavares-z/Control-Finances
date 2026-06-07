"use client";

import * as RemixIcons from "@remixicon/react";
import Link from "next/link";
import type { GoalData } from "@/features/goals/queries";
import { Progress } from "@/shared/components/ui/progress";
import { getIconComponent } from "@/shared/utils/icons";
import { cn } from "@/shared/utils/ui";

const formatCurrency = (value: number) =>
	new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(value);

interface GoalsWidgetProps {
	goals: GoalData[];
}

export function GoalsWidget({ goals }: GoalsWidgetProps) {
	if (goals.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
				<div className="flex size-10 items-center justify-center rounded-full bg-muted">
					<RemixIcons.RiSaveLine
						className="size-5 text-muted-foreground"
						aria-hidden
					/>
				</div>
				<div className="flex flex-col gap-1">
					<p className="text-sm font-medium">Nenhuma meta ativa</p>
					<p className="text-xs text-muted-foreground">
						Crie metas para acompanhar seus objetivos.
					</p>
				</div>
				<Link
					href="/metas"
					className="text-xs font-medium text-primary hover:underline"
				>
					Criar meta
				</Link>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			{goals.map((goal) => {
				const IconComponent = goal.icon
					? getIconComponent(goal.icon)
					: getIconComponent("RiSaveLine");

				return (
					<div key={goal.id} className="flex flex-col gap-2">
						<div className="flex items-center justify-between gap-2">
							<div className="flex items-center gap-2 min-w-0">
								<div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
									{IconComponent ? (
										<IconComponent className="size-3.5" aria-hidden />
									) : (
										<RemixIcons.RiSaveLine className="size-3.5" aria-hidden />
									)}
								</div>
								<span className="text-sm font-medium truncate">{goal.name}</span>
							</div>
							<span
								className={cn(
									"text-xs font-medium shrink-0",
									goal.isCompleted
										? "text-emerald-600 dark:text-emerald-400"
										: "text-muted-foreground",
								)}
							>
								{goal.usedPercentage.toFixed(0)}%
							</span>
						</div>
						<Progress
							value={goal.usedPercentage}
							className={cn(
								"h-1.5",
								goal.isCompleted && "[&>div]:bg-emerald-500",
							)}
						/>
						<div className="flex items-center justify-between text-xs text-muted-foreground">
							<span>{formatCurrency(goal.currentAmount)}</span>
							<span>{formatCurrency(goal.targetAmount)}</span>
						</div>
					</div>
				);
			})}
		</div>
	);
}