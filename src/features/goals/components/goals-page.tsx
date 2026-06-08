"use client";

import * as RemixIcons from "@remixicon/react";
import { useState } from "react";
import type { AccountData } from "@/features/accounts/queries";
import { GoalDialog } from "@/features/goals/components/goal-dialog";
import { GoalsList } from "@/features/goals/components/goals-list";
import type { GoalData } from "@/features/goals/queries";
import { Button } from "@/shared/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";

interface GoalsPageProps {
	activeGoals: GoalData[];
	completedGoals: GoalData[];
	archivedGoals: GoalData[];
	accounts: AccountData[];
}

export function GoalsPage({
	activeGoals,
	completedGoals,
	archivedGoals,
	accounts,
}: GoalsPageProps) {
	const [newDialogOpen, setNewDialogOpen] = useState(false);

	return (
		<div className="flex flex-col gap-6">
			{/* Header */}
			<div className="flex items-center justify-between gap-4">
				<div>
					<h1 className="text-xl font-semibold">Metas financeiras</h1>
					<p className="text-sm text-muted-foreground">
						Acompanhe seu progresso rumo aos seus objetivos.
					</p>
				</div>
				<Button onClick={() => setNewDialogOpen(true)}>
					<RemixIcons.RiAddLine className="size-4" aria-hidden />
					Nova meta
				</Button>
			</div>

			{/* Tabs */}
			<Tabs defaultValue="ativas">
				<TabsList>
					<TabsTrigger value="ativas">
						Ativas
						{activeGoals.length > 0 && (
							<span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
								{activeGoals.length}
							</span>
						)}
					</TabsTrigger>
					<TabsTrigger value="concluidas">
						Concluídas
						{completedGoals.length > 0 && (
							<span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
								{completedGoals.length}
							</span>
						)}
					</TabsTrigger>
					<TabsTrigger value="arquivadas">Arquivadas</TabsTrigger>
				</TabsList>

				<TabsContent value="ativas" className="mt-4">
					<GoalsList goals={activeGoals} accounts={accounts} status="ativa" />
				</TabsContent>

				<TabsContent value="concluidas" className="mt-4">
					<GoalsList goals={completedGoals} accounts={accounts} status="concluida" />
				</TabsContent>

				<TabsContent value="arquivadas" className="mt-4">
					<GoalsList goals={archivedGoals} accounts={accounts} status="arquivada" />
				</TabsContent>
			</Tabs>

			{/* Dialog nova meta (acionado pelo header) */}
			<GoalDialog
				open={newDialogOpen}
				onOpenChange={setNewDialogOpen}
				goal={null}
				accounts={accounts}
			/>
		</div>
	);
}