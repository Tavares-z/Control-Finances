"use client";

import * as RemixIcons from "@remixicon/react";
import { useState } from "react";
import { SubscriptionDialog } from "@/features/subscriptions/components/subscription-dialog";
import { SubscriptionsList } from "@/features/subscriptions/components/subscriptions-list";
import type { SubscriptionData } from "@/features/subscriptions/queries";
import { Button } from "@/shared/components/ui/button";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/shared/components/ui/tabs";

type SimpleOption = { id: string; name: string };

interface SubscriptionsPageProps {
	activeSubscriptions: SubscriptionData[];
	pausedSubscriptions: SubscriptionData[];
	cancelledSubscriptions: SubscriptionData[];
	accounts: SimpleOption[];
	cards: SimpleOption[];
	categories: SimpleOption[];
	payers: SimpleOption[];
}

export function SubscriptionsPage({
	activeSubscriptions,
	pausedSubscriptions,
	cancelledSubscriptions,
	accounts,
	cards,
	categories,
	payers,
}: SubscriptionsPageProps) {
	const [newDialogOpen, setNewDialogOpen] = useState(false);

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center justify-between gap-4">
				<div>
					<h1 className="text-xl font-semibold">Assinaturas</h1>
					<p className="text-sm text-muted-foreground">
						Cobranças recorrentes que geram pré-lançamentos automaticamente no
						Inbox.
					</p>
				</div>
				<Button onClick={() => setNewDialogOpen(true)}>
					<RemixIcons.RiAddLine className="size-4" aria-hidden />
					Nova assinatura
				</Button>
			</div>

			<Tabs defaultValue="ativas">
				<TabsList>
					<TabsTrigger value="ativas">
						Ativas
						{activeSubscriptions.length > 0 && (
							<span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
								{activeSubscriptions.length}
							</span>
						)}
					</TabsTrigger>
					<TabsTrigger value="pausadas">
						Pausadas
						{pausedSubscriptions.length > 0 && (
							<span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
								{pausedSubscriptions.length}
							</span>
						)}
					</TabsTrigger>
					<TabsTrigger value="canceladas">Canceladas</TabsTrigger>
				</TabsList>

				<TabsContent value="ativas" className="mt-4">
					<SubscriptionsList
						subscriptions={activeSubscriptions}
						accounts={accounts}
						cards={cards}
						categories={categories}
						payers={payers}
						status="ativa"
					/>
				</TabsContent>

				<TabsContent value="pausadas" className="mt-4">
					<SubscriptionsList
						subscriptions={pausedSubscriptions}
						accounts={accounts}
						cards={cards}
						categories={categories}
						payers={payers}
						status="pausada"
					/>
				</TabsContent>

				<TabsContent value="canceladas" className="mt-4">
					<SubscriptionsList
						subscriptions={cancelledSubscriptions}
						accounts={accounts}
						cards={cards}
						categories={categories}
						payers={payers}
						status="cancelada"
					/>
				</TabsContent>
			</Tabs>

			<SubscriptionDialog
				open={newDialogOpen}
				onOpenChange={setNewDialogOpen}
				subscription={null}
				accounts={accounts}
				cards={cards}
				categories={categories}
				payers={payers}
			/>
		</div>
	);
}
