"use client";

import * as RemixIcons from "@remixicon/react";
import { useState } from "react";
import { SubscriptionCard } from "@/features/subscriptions/components/subscription-card";
import { SubscriptionDialog } from "@/features/subscriptions/components/subscription-dialog";
import type {
	SubscriptionData,
	SubscriptionStatus,
} from "@/features/subscriptions/queries";
import { Button } from "@/shared/components/ui/button";

type SimpleOption = { id: string; name: string };

const EMPTY_STATE = {
	ativa: {
		label: "Nenhuma assinatura ativa",
		description:
			"Cadastre suas assinaturas e despesas fixas para gerar pré-lançamentos automaticamente no Inbox quando vencerem.",
		showCreate: true,
	},
	pausada: {
		label: "Nenhuma assinatura pausada",
		description: "Assinaturas pausadas aparecerão aqui.",
		showCreate: false,
	},
	cancelada: {
		label: "Nenhuma assinatura cancelada",
		description: "Assinaturas canceladas aparecerão aqui.",
		showCreate: false,
	},
} as const;

interface SubscriptionsListProps {
	subscriptions: SubscriptionData[];
	accounts: SimpleOption[];
	cards: SimpleOption[];
	categories: SimpleOption[];
	payers: SimpleOption[];
	status: SubscriptionStatus;
}

export function SubscriptionsList({
	subscriptions,
	accounts,
	cards,
	categories,
	payers,
	status,
}: SubscriptionsListProps) {
	const [dialogOpen, setDialogOpen] = useState(false);
	const [selectedSubscription, setSelectedSubscription] =
		useState<SubscriptionData | null>(null);

	const handleEdit = (subscription: SubscriptionData) => {
		setSelectedSubscription(subscription);
		setDialogOpen(true);
	};

	const handleDialogOpenChange = (open: boolean) => {
		setDialogOpen(open);
		if (!open) setSelectedSubscription(null);
	};

	const emptyState = EMPTY_STATE[status];

	if (subscriptions.length === 0) {
		return (
			<>
				<div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border py-16 text-center">
					<div className="flex size-12 items-center justify-center rounded-full bg-muted">
						<RemixIcons.RiRepeatLine
							className="size-6 text-muted-foreground"
							aria-hidden
						/>
					</div>
					<div className="flex flex-col gap-1">
						<p className="font-medium text-sm">{emptyState.label}</p>
						<p className="text-xs text-muted-foreground max-w-xs">
							{emptyState.description}
						</p>
					</div>
					{emptyState.showCreate && (
						<Button size="sm" onClick={() => setDialogOpen(true)}>
							<RemixIcons.RiAddLine className="size-4" aria-hidden />
							Criar primeira assinatura
						</Button>
					)}
				</div>

				{emptyState.showCreate && (
					<SubscriptionDialog
						open={dialogOpen}
						onOpenChange={handleDialogOpenChange}
						subscription={null}
						accounts={accounts}
						cards={cards}
						categories={categories}
						payers={payers}
					/>
				)}
			</>
		);
	}

	return (
		<>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{subscriptions.map((subscription) => (
					<SubscriptionCard
						key={subscription.id}
						subscription={subscription}
						onEdit={handleEdit}
					/>
				))}
			</div>

			<SubscriptionDialog
				open={dialogOpen}
				onOpenChange={handleDialogOpenChange}
				subscription={selectedSubscription}
				accounts={accounts}
				cards={cards}
				categories={categories}
				payers={payers}
			/>
		</>
	);
}
