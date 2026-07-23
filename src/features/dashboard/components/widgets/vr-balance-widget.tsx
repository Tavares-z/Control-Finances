"use client";

import { RiRestaurantLine } from "@remixicon/react";
import Link from "next/link";
import type {
	VrBalanceSnapshot,
	VrPaceVerdict,
} from "@/features/dashboard/vr/vr-balance-queries";
import { Badge } from "@/shared/components/ui/badge";
import { WidgetEmptyState } from "@/shared/components/widgets/widget-empty-state";
import { cn } from "@/shared/utils/ui";

const formatCurrency = (value: number) =>
	new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	}).format(value);

const VERDICT_LABEL: Record<VrPaceVerdict, string> = {
	fecha: "Ritmo fecha o ciclo",
	aperta: "Ritmo aperta no fim",
	"nao-fecha": "Ritmo não fecha o ciclo",
	impreciso: "Ritmo ainda impreciso",
};

const VERDICT_CLASS: Record<VrPaceVerdict, string> = {
	fecha: "bg-success/10 text-success",
	aperta: "bg-warning/10 text-warning",
	"nao-fecha": "bg-destructive/10 text-destructive",
	impreciso: "bg-muted text-muted-foreground",
};

interface VrBalanceWidgetProps {
	data: VrBalanceSnapshot | null;
}

export function VrBalanceWidget({ data }: VrBalanceWidgetProps) {
	if (!data) {
		return (
			<WidgetEmptyState
				icon={<RiRestaurantLine className="size-5" />}
				title="Nenhuma conta de VR/VA"
				description="Cadastre uma conta do tipo Pré-Pago | VR/VA para acompanhar o saldo."
			/>
		);
	}

	const {
		accountId,
		balance,
		daysElapsed,
		daysRemaining,
		spentInCycle,
		dailyPace,
		dailyAllowance,
		daysOfRunway,
		verdict,
		cycleIsEstimated,
		lastRechargeDate,
		nextRechargeDate,
		nextRechargeIsManual,
	} = data;

	const showPace = verdict !== "impreciso";

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-baseline justify-between">
				<span className="text-xs text-muted-foreground">Saldo disponível</span>
				<span className="text-lg font-semibold">{formatCurrency(balance)}</span>
			</div>

			<div className="grid grid-cols-2 gap-3">
				<div className="flex flex-col gap-1">
					<span className="text-xs text-muted-foreground">
						Disponível por dia
					</span>
					<span className="text-sm font-semibold">
						{formatCurrency(dailyAllowance)}
					</span>
				</div>
				<div className="flex flex-col gap-1">
					<span className="text-xs text-muted-foreground">Ritmo atual</span>
					<span
						className={cn(
							"text-sm font-semibold",
							showPace && dailyPace > dailyAllowance && "text-destructive",
						)}
					>
						{showPace ? `${formatCurrency(dailyPace)}/dia` : "—"}
					</span>
				</div>
			</div>

			<div className="flex items-center justify-between gap-2">
				<Badge className={cn("font-medium", VERDICT_CLASS[verdict])}>
					{VERDICT_LABEL[verdict]}
				</Badge>
				{showPace && daysOfRunway !== null && (
					<span className="text-xs text-muted-foreground">
						dura ~{Math.floor(daysOfRunway)}d · faltam {daysRemaining}d
					</span>
				)}
			</div>

			<div className="flex flex-col gap-1 border-t pt-3">
				<div className="flex items-center justify-between">
					<span className="text-xs text-muted-foreground">
						Gasto no ciclo ({daysElapsed}d)
					</span>
					<span className="text-xs font-medium">
						{formatCurrency(spentInCycle)}
					</span>
				</div>
				{lastRechargeDate && (
					<p className="text-xs text-muted-foreground">
						Desde a última recarga em{" "}
						{new Date(`${lastRechargeDate}T00:00:00`).toLocaleDateString(
							"pt-BR",
						)}
						{cycleIsEstimated &&
							!nextRechargeIsManual &&
							" · ciclo de 30d presumido"}
					</p>
				)}
				{!lastRechargeDate && (
					<p className="text-xs text-muted-foreground">
						Lance a recarga como receita nesta conta para acompanhar o ritmo.
					</p>
				)}
				{nextRechargeIsManual && nextRechargeDate && (
					<p className="text-xs text-muted-foreground">
						Próxima recarga em{" "}
						{new Date(`${nextRechargeDate}T00:00:00`).toLocaleDateString(
							"pt-BR",
						)}{" "}
						· data informada
					</p>
				)}
			</div>

			<Link
				href={`/accounts/${accountId}/statement`}
				className="text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
			>
				Ver extrato
			</Link>
		</div>
	);
}
