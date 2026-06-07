"use client";

import * as RemixIcons from "@remixicon/react";
import { useTransition } from "react";
import { toast } from "sonner";
import {
	archiveGoalAction,
	completeGoalAction,
	deleteGoalAction,
} from "@/features/goals/actions";
import type { GoalData } from "@/features/goals/queries";
import { Button } from "@/shared/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Progress } from "@/shared/components/ui/progress";
import { getIconComponent } from "@/shared/utils/icons";
import { cn } from "@/shared/utils/ui";

const formatCurrency = (value: number) =>
	new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	}).format(value);

const getDaysRemaining = (deadline: Date | null): string => {
	if (!deadline) return "Sem prazo";
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const diff = Math.ceil(
		(deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
	);
	if (diff < 0) return "Prazo encerrado";
	if (diff === 0) return "Vence hoje";
	if (diff === 1) return "Vence amanhã";
	return `${diff} dias restantes`;
};

interface GoalCardProps {
	goal: GoalData;
	onEdit: (goal: GoalData) => void;
}

export function GoalCard({ goal, onEdit }: GoalCardProps) {
	const [isPending, startTransition] = useTransition();

	const IconComponent = goal.icon
		? getIconComponent(goal.icon)
		: getIconComponent("RiSaveLine");

	const daysLabel = getDaysRemaining(goal.deadline);
	const isOverdue =
		goal.deadline && new Date(goal.deadline) < new Date() && !goal.isCompleted;

	const handleArchive = () => {
		startTransition(async () => {
			const result = await archiveGoalAction({ id: goal.id });
			if (result.success) {
				toast.success(result.message);
			} else {
				toast.error(result.error);
			}
		});
	};

	const handleComplete = () => {
		startTransition(async () => {
			const result = await completeGoalAction({ id: goal.id });
			if (result.success) {
				toast.success(result.message);
			} else {
				toast.error(result.error);
			}
		});
	};

	const handleDelete = () => {
		startTransition(async () => {
			const result = await deleteGoalAction({ id: goal.id });
			if (result.success) {
				toast.success(result.message);
			} else {
				toast.error(result.error);
			}
		});
	};

	return (
		<div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4">
			{/* Header */}
			<div className="flex items-start justify-between gap-3">
				<div className="flex items-center gap-3 min-w-0">
					<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
						{IconComponent ? (
							<IconComponent className="size-5" aria-hidden />
						) : (
							<RemixIcons.RiSaveLine className="size-5" aria-hidden />
						)}
					</div>
					<div className="min-w-0">
						<p className="font-medium text-sm truncate">{goal.name}</p>
						{goal.accountName && (
							<p className="text-xs text-muted-foreground truncate">
								{goal.accountName}
							</p>
						)}
					</div>
				</div>

				<div className="flex items-center gap-1 shrink-0">
					{goal.isCompleted && (
						<span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
							<RemixIcons.RiCheckLine className="size-3" aria-hidden />
							Concluída
						</span>
					)}

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="size-7"
								disabled={isPending}
							>
								<RemixIcons.RiMore2Line className="size-4" aria-hidden />
								<span className="sr-only">Ações da meta</span>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={() => onEdit(goal)}>
								<RemixIcons.RiEditLine className="size-4" aria-hidden />
								Editar
							</DropdownMenuItem>
							{!goal.isCompleted && (
								<DropdownMenuItem onClick={handleComplete}>
									<RemixIcons.RiCheckDoubleLine className="size-4" aria-hidden />
									Marcar como concluída
								</DropdownMenuItem>
							)}
							<DropdownMenuItem onClick={handleArchive}>
								<RemixIcons.RiArchiveLine className="size-4" aria-hidden />
								Arquivar
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={handleDelete}
								className="text-destructive focus:text-destructive"
							>
								<RemixIcons.RiDeleteBinLine className="size-4" aria-hidden />
								Excluir
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			{/* Progress */}
			<div className="flex flex-col gap-2">
				<Progress
					value={goal.usedPercentage}
					className={cn(
						"h-2",
						goal.isCompleted && "[&>div]:bg-emerald-500",
					)}
				/>
				<div className="flex items-center justify-between text-xs text-muted-foreground">
					<span>{formatCurrency(goal.currentAmount)}</span>
					<span className="font-medium">
						{goal.usedPercentage.toFixed(0)}%
					</span>
					<span>{formatCurrency(goal.targetAmount)}</span>
				</div>
			</div>

			{/* Footer */}
			<div className="flex items-center justify-between text-xs">
				{!goal.isCompleted && (
					<span className="text-muted-foreground">
						Faltam{" "}
						<span className="font-medium text-foreground">
							{formatCurrency(goal.remainingAmount)}
						</span>
					</span>
				)}
				{goal.isCompleted && (
					<span className="text-emerald-600 dark:text-emerald-400 font-medium">
						Meta atingida!
					</span>
				)}
				<span
					className={cn(
						"ml-auto text-muted-foreground",
						isOverdue && "text-destructive",
					)}
				>
					{daysLabel}
				</span>
			</div>
		</div>
	);
}