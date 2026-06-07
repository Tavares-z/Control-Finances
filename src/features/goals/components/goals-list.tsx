"use client";

import * as RemixIcons from "@remixicon/react";
import { useState } from "react";
import type { AccountData } from "@/features/accounts/queries";
import { GoalCard } from "@/features/goals/components/goal-card";
import { GoalDialog } from "@/features/goals/components/goal-dialog";
import type { GoalData } from "@/features/goals/queries";
import { Button } from "@/shared/components/ui/button";

interface GoalsListProps {
	goals: GoalData[];
	accounts: AccountData[];
}

export function GoalsList({ goals, accounts }: GoalsListProps) {
	const [dialogOpen, setDialogOpen] = useState(false);
	const [selectedGoal, setSelectedGoal] = useState<GoalData | null>(null);

	const handleEdit = (goal: GoalData) => {
		setSelectedGoal(goal);
		setDialogOpen(true);
	};

	const handleDialogOpenChange = (open: boolean) => {
		setDialogOpen(open);
		if (!open) setSelectedGoal(null);
	};

	if (goals.length === 0) {
		return (
			<>
				<div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border py-16 text-center">
					<div className="flex size-12 items-center justify-center rounded-full bg-muted">
						<RemixIcons.RiSaveLine
							className="size-6 text-muted-foreground"
							aria-hidden
						/>
					</div>
					<div className="flex flex-col gap-1">
						<p className="font-medium text-sm">Nenhuma meta cadastrada</p>
						<p className="text-xs text-muted-foreground max-w-xs">
							Crie metas financeiras para acompanhar seu progresso rumo aos
							seus objetivos.
						</p>
					</div>
					<Button size="sm" onClick={() => setDialogOpen(true)}>
						<RemixIcons.RiAddLine className="size-4" aria-hidden />
						Criar primeira meta
					</Button>
				</div>

				<GoalDialog
					open={dialogOpen}
					onOpenChange={handleDialogOpenChange}
					goal={null}
					accounts={accounts}
				/>
			</>
		);
	}

	return (
		<>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{goals.map((goal) => (
					<GoalCard key={goal.id} goal={goal} onEdit={handleEdit} />
				))}
			</div>

			<GoalDialog
				open={dialogOpen}
				onOpenChange={handleDialogOpenChange}
				goal={selectedGoal}
				accounts={accounts}
			/>
		</>
	);
}