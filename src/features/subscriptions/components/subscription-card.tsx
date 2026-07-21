"use client";

import * as RemixIcons from "@remixicon/react";
import { useTransition } from "react";
import { toast } from "sonner";
import {
	cancelSubscriptionAction,
	deleteSubscriptionAction,
	pauseSubscriptionAction,
	reactivateSubscriptionAction,
} from "@/features/subscriptions/actions";
import type { SubscriptionData } from "@/features/subscriptions/queries";
import { Button } from "@/shared/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { getIconComponent } from "@/shared/utils/icons";

const formatCurrency = (value: number) =>
	new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	}).format(value);

interface SubscriptionCardProps {
	subscription: SubscriptionData;
	onEdit: (subscription: SubscriptionData) => void;
}

export function SubscriptionCard({
	subscription,
	onEdit,
}: SubscriptionCardProps) {
	const [isPending, startTransition] = useTransition();

	const IconComponent = subscription.icon
		? getIconComponent(subscription.icon)
		: getIconComponent("RiRepeatLine");

	const isActive = subscription.status === "ativa";
	const isPaused = subscription.status === "pausada";
	const isCancelled = subscription.status === "cancelada";

	const chargedFrom =
		subscription.cardId && subscription.cardName
			? `Cartão · ${subscription.cardName}`
			: subscription.accountName
				? `Conta · ${subscription.accountName}`
				: null;

	const handlePause = () => {
		startTransition(async () => {
			const result = await pauseSubscriptionAction({ id: subscription.id });
			if (result.success) toast.success(result.message);
			else toast.error(result.error);
		});
	};

	const handleReactivate = () => {
		startTransition(async () => {
			const result = await reactivateSubscriptionAction({
				id: subscription.id,
			});
			if (result.success) toast.success(result.message);
			else toast.error(result.error);
		});
	};

	const handleCancel = () => {
		startTransition(async () => {
			const result = await cancelSubscriptionAction({ id: subscription.id });
			if (result.success) toast.success(result.message);
			else toast.error(result.error);
		});
	};

	const handleDelete = () => {
		startTransition(async () => {
			const result = await deleteSubscriptionAction({ id: subscription.id });
			if (result.success) toast.success(result.message);
			else toast.error(result.error);
		});
	};

	return (
		<div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4">
			<div className="flex items-start justify-between gap-3">
				<div className="flex items-center gap-3 min-w-0">
					<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
						{IconComponent ? (
							<IconComponent className="size-5" aria-hidden />
						) : (
							<RemixIcons.RiRepeatLine className="size-5" aria-hidden />
						)}
					</div>
					<div className="min-w-0">
						<p className="font-medium text-sm truncate">{subscription.name}</p>
						{chargedFrom && (
							<p className="text-xs text-muted-foreground truncate">
								{chargedFrom}
							</p>
						)}
					</div>
				</div>

				<div className="flex items-center gap-1 shrink-0">
					{isPaused && (
						<span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
							<RemixIcons.RiPauseCircleLine className="size-3" aria-hidden />
							Pausada
						</span>
					)}
					{isCancelled && (
						<span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
							<RemixIcons.RiCloseCircleLine className="size-3" aria-hidden />
							Cancelada
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
								<span className="sr-only">Ações da assinatura</span>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={() => onEdit(subscription)}>
								<RemixIcons.RiEditLine className="size-4" aria-hidden />
								Editar
							</DropdownMenuItem>

							{isActive && (
								<>
									<DropdownMenuItem onClick={handlePause}>
										<RemixIcons.RiPauseCircleLine
											className="size-4"
											aria-hidden
										/>
										Pausar
									</DropdownMenuItem>
									<DropdownMenuItem onClick={handleCancel}>
										<RemixIcons.RiCloseCircleLine
											className="size-4"
											aria-hidden
										/>
										Cancelar
									</DropdownMenuItem>
								</>
							)}

							{isPaused && (
								<>
									<DropdownMenuItem onClick={handleReactivate}>
										<RemixIcons.RiPlayCircleLine
											className="size-4"
											aria-hidden
										/>
										Reativar
									</DropdownMenuItem>
									<DropdownMenuItem onClick={handleCancel}>
										<RemixIcons.RiCloseCircleLine
											className="size-4"
											aria-hidden
										/>
										Cancelar
									</DropdownMenuItem>
								</>
							)}

							{isCancelled && (
								<DropdownMenuItem onClick={handleReactivate}>
									<RemixIcons.RiArrowGoBackLine
										className="size-4"
										aria-hidden
									/>
									Reativar
								</DropdownMenuItem>
							)}

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

			<div className="flex items-center justify-between text-sm">
				<span className="font-semibold">
					{formatCurrency(subscription.amount)}
				</span>
				<span className="text-xs text-muted-foreground">
					Todo dia {subscription.billingDay}
				</span>
			</div>

			{subscription.categoryName && (
				<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<RemixIcons.RiPriceTag3Line className="size-3.5" aria-hidden />
					{subscription.categoryName}
				</div>
			)}

			{subscription.note && (
				<div className="flex items-start gap-1.5 text-xs text-muted-foreground">
					<RemixIcons.RiStickyNoteLine
						className="size-3.5 shrink-0 mt-0.5"
						aria-hidden
					/>
					<span className="whitespace-pre-wrap break-words">
						{subscription.note}
					</span>
				</div>
			)}

			{subscription.cardId && (
				<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<RemixIcons.RiInformationLine className="size-3.5" aria-hidden />
					Não gera item no Inbox (vai na fatura)
				</div>
			)}
		</div>
	);
}
