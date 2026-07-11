"use client";

import {
	RiCalendarCloseLine,
	RiCalendarScheduleLine,
	RiChat3Line,
	RiDeleteBin5Line,
	RiFileList2Line,
	RiPencilLine,
} from "@remixicon/react";
import Image from "next/image";
import MoneyValues from "@/shared/components/money-values";
import { Badge } from "@/shared/components/ui/badge";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
} from "@/shared/components/ui/card";
import { Progress } from "@/shared/components/ui/progress";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { resolveCardBrandAsset } from "@/shared/lib/cards/brand-assets";
import {
	INVOICE_PAYMENT_STATUS,
	type InvoicePaymentStatus,
} from "@/shared/lib/invoices";
import { resolveLogoSrc } from "@/shared/lib/logo";
import { cn } from "@/shared/utils/ui";

interface CardItemProps {
	name: string;
	brand: string;
	status: string;
	closingDay: string;
	dueDay: string;
	limit: number;
	limitInUse?: number;
	limitAvailable?: number;
	currentInvoiceAmount: number;
	currentInvoiceLabel: string;
	currentInvoiceStatus: InvoicePaymentStatus | null;
	accountName: string;
	logo?: string | null;
	note?: string | null;
	onEdit?: () => void;
	onInvoice?: () => void;
	onRemove?: () => void;
}

const formatDay = (value: string) => value.padStart(2, "0");

export function CardItem({
	name,
	brand,
	status,
	closingDay,
	dueDay,
	limit,
	limitInUse,
	limitAvailable,
	currentInvoiceAmount,
	currentInvoiceLabel,
	currentInvoiceStatus,
	accountName: _accountName,
	logo,
	note,
	onEdit,
	onInvoice,
	onRemove,
}: CardItemProps) {
	void _accountName;

	const used =
		limitInUse ??
		(limitAvailable !== undefined ? Math.max(limit - limitAvailable, 0) : 0);

	const available = limitAvailable ?? Math.max(limit - used, 0);

	const usagePercent =
		limit > 0 ? Math.min(Math.max((used / limit) * 100, 0), 100) : 0;
	const exceeded = usagePercent >= 100;

	const logoPath = resolveLogoSrc(logo);
	const brandAsset = resolveCardBrandAsset(brand);
	const isInactive = status?.toLowerCase() === "inativo";
	const isCurrentInvoicePaid =
		currentInvoiceStatus === INVOICE_PAYMENT_STATUS.PAID;

	return (
		<Card className="flex flex-col p-6 w-full">
			<CardHeader className="space-y-1 p-0">
				<div className="flex items-start justify-between gap-2">
					<div className="flex flex-1 items-center gap-2">
						{logoPath ? (
							<div className="flex size-10 shrink-0 items-center justify-center overflow-hidden">
								<Image
									src={logoPath}
									alt={`Logo do cartão ${name}`}
									width={42}
									height={42}
									className={cn(
										"rounded-full",
										isInactive && "grayscale opacity-40",
									)}
								/>
							</div>
						) : null}

						<div className="min-w-0">
							<div className="flex items-center gap-2">
								<h3 className="truncate font-semibold text-foreground">
									{name}
								</h3>
								{note ? (
									<Tooltip>
										<TooltipTrigger asChild>
											<button
												type="button"
												className="text-muted-foreground/70 transition-colors hover:text-foreground"
												aria-label="Observações do cartão"
											>
												<RiChat3Line className="size-3.5" />
											</button>
										</TooltipTrigger>
										<TooltipContent side="top" align="start">
											{note}
										</TooltipContent>
									</Tooltip>
								) : null}
							</div>

							{status ? (
								<span className="text-xs tracking-wide text-muted-foreground">
									{status}
								</span>
							) : null}
						</div>
					</div>

					{brandAsset ? (
						<div className="flex items-center justify-center py-2">
							<Image
								src={brandAsset}
								alt={`Bandeira ${brand}`}
								width={36}
								height={36}
								className={cn(
									"h-4 w-auto rounded",
									isInactive && "grayscale opacity-40",
								)}
							/>
						</div>
					) : (
						<span className="text-sm font-medium text-muted-foreground">
							{brand}
						</span>
					)}
				</div>

				<div className="flex items-center justify-between text-sm text-muted-foreground rounded-lg py-4 px-2 bg-primary/5">
					<span className="inline-flex items-center gap-1">
						<RiCalendarCloseLine className="size-4" aria-hidden />
						Fecha{" "}
						<span className="font-semibold text-foreground">
							dia {formatDay(closingDay)}
						</span>
					</span>
					<span className="inline-flex items-center gap-1">
						<RiCalendarScheduleLine className="size-4" aria-hidden />
						Vence{" "}
						<span className="font-semibold text-foreground">
							dia {formatDay(dueDay)}
						</span>
					</span>
				</div>
			</CardHeader>

			<CardContent className="flex flex-1 flex-col gap-4 px-0">
				<div className="flex flex-col gap-0.5">
					<span className="text-xs text-muted-foreground">
						{currentInvoiceLabel}
					</span>
					<div className="flex flex-wrap items-center gap-2">
						<MoneyValues
							amount={currentInvoiceAmount}
							className="text-xl font-semibold text-info"
						/>
						{isCurrentInvoicePaid ? (
							<Badge variant="success" className="text-xs">
								Paga
							</Badge>
						) : null}
					</div>
				</div>

				<div className="flex gap-2 justify-between w-full">
					<div className="flex min-w-0 flex-col gap-0.5">
						<span className="text-xs text-muted-foreground">Limite total</span>
						<MoneyValues
							amount={limit}
							className="text-sm font-semibold text-foreground"
						/>
					</div>

					<div className="flex min-w-0 flex-col gap-0.5">
						<span className="text-xs text-muted-foreground">
							Limite utilizado
						</span>
						<MoneyValues
							amount={used}
							className="text-sm font-semibold text-primary"
						/>
					</div>

					<div className="flex min-w-0 flex-col gap-0.5">
						<span className="text-xs text-muted-foreground">
							Limite disponível
						</span>
						<MoneyValues
							amount={available}
							className="text-sm font-semibold text-success"
						/>
					</div>
				</div>

				<div className="flex flex-col gap-2">
					<Progress
						value={usagePercent}
						className={cn("h-2.5", exceeded && "bg-destructive/20!")}
						indicatorClassName={cn(exceeded && "bg-destructive")}
						aria-label={`${usagePercent.toFixed(0)}% do limite utilizado`}
					/>
					<span className="text-xs text-muted-foreground">
						{usagePercent.toFixed(0)}% utilizado
					</span>
				</div>
			</CardContent>

			<CardFooter className="mt-auto flex flex-wrap gap-4 px-0 pt-2 text-sm">
				<button
					type="button"
					onClick={onEdit}
					className="flex items-center gap-1 font-medium text-primary transition-opacity hover:opacity-80"
				>
					<RiPencilLine className="size-4" aria-hidden />
					editar
				</button>
				<button
					type="button"
					onClick={onInvoice}
					className="flex items-center gap-1 font-medium text-primary transition-opacity hover:opacity-80"
				>
					<RiFileList2Line className="size-4" aria-hidden />
					fatura
				</button>
				<button
					type="button"
					onClick={onRemove}
					className="flex items-center gap-1 font-medium text-destructive transition-opacity hover:opacity-80"
				>
					<RiDeleteBin5Line className="size-4" aria-hidden />
					remover
				</button>
			</CardFooter>
		</Card>
	);
}
