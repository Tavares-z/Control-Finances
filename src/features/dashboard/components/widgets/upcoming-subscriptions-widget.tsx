"use client";

import * as RemixIcons from "@remixicon/react";
import Link from "next/link";
import type { SubscriptionData } from "@/features/subscriptions/queries";
import { getIconComponent } from "@/shared/utils/icons";

const formatCurrency = (value: number) =>
	new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(value);

interface UpcomingSubscriptionsWidgetProps {
	subscriptions: SubscriptionData[];
}

export function UpcomingSubscriptionsWidget({
	subscriptions,
}: UpcomingSubscriptionsWidgetProps) {
	if (subscriptions.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
				<div className="flex size-10 items-center justify-center rounded-full bg-muted">
					<RemixIcons.RiRepeatLine
						className="size-5 text-muted-foreground"
						aria-hidden
					/>
				</div>
				<div className="flex flex-col gap-1">
					<p className="text-sm font-medium">Nenhuma assinatura ativa</p>
					<p className="text-xs text-muted-foreground">
						Cadastre suas assinaturas para não esquecer nenhuma cobrança.
					</p>
				</div>
				<Link
					href="/assinaturas"
					className="text-xs font-medium text-primary hover:underline"
				>
					Criar assinatura
				</Link>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			{subscriptions.map((subscription) => {
				const IconComponent = subscription.icon
					? getIconComponent(subscription.icon)
					: getIconComponent("RiRepeatLine");

				return (
					<div
						key={subscription.id}
						className="flex items-center justify-between gap-2"
					>
						<div className="flex items-center gap-2 min-w-0">
							<div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
								{IconComponent ? (
									<IconComponent className="size-3.5" aria-hidden />
								) : (
									<RemixIcons.RiRepeatLine className="size-3.5" aria-hidden />
								)}
							</div>
							<span className="text-sm font-medium truncate">
								{subscription.name}
							</span>
						</div>
						<div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
							<span>Dia {subscription.billingDay}</span>
							<span className="font-medium text-foreground">
								{formatCurrency(subscription.amount)}
							</span>
						</div>
					</div>
				);
			})}
		</div>
	);
}
