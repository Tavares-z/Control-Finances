"use client";

import { RiDeleteBinLine } from "@remixicon/react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	advanceInvoiceAction,
	removeInvoiceAdvanceAction,
} from "@/features/invoices/actions";
import type { InvoiceAdvance } from "@/features/invoices/queries";
import { AccountCardSelectContent } from "@/features/transactions/components/select-items";
import { Button } from "@/shared/components/ui/button";
import { CurrencyInput } from "@/shared/components/ui/currency-input";
import { DatePicker } from "@/shared/components/ui/date-picker";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/shared/components/ui/dialog";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDateOnly } from "@/shared/utils/date";

type PaymentAccountOption = {
	value: string;
	label: string;
	logo?: string | null;
};

type AdvanceInvoiceDialogProps = {
	trigger: ReactNode;
	cardId: string;
	period: string;
	/** Total a pagar da fatura (com sinal). Usado só para orientar o usuário. */
	currentTotal: number;
	/** Adiantamentos já registrados neste período. */
	advances: InvoiceAdvance[];
	defaultPaymentAccountId: string | null;
	paymentAccountOptions: PaymentAccountOption[];
};

const formatAdvanceDate = (value: Date) =>
	formatDateOnly(value, { day: "2-digit", month: "short" }) ?? "";

export function AdvanceInvoiceDialog({
	trigger,
	cardId,
	period,
	currentTotal,
	advances,
	defaultPaymentAccountId,
	paymentAccountOptions,
}: AdvanceInvoiceDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();

	const remaining = Math.abs(currentTotal);

	const [amount, setAmount] = useState<string>("");
	const [accountId, setAccountId] = useState<string>(
		defaultPaymentAccountId ?? paymentAccountOptions[0]?.value ?? "",
	);
	const [paymentDate, setPaymentDate] = useState<Date>(new Date());

	useEffect(() => {
		if (open) {
			setAmount("");
			setAccountId(
				defaultPaymentAccountId ?? paymentAccountOptions[0]?.value ?? "",
			);
			setPaymentDate(new Date());
		}
	}, [open, defaultPaymentAccountId, paymentAccountOptions]);

	const targetAmount = Number(amount);
	const paymentDateValue = paymentDate.toISOString().split("T")[0] ?? "";
	const selectedAccount = paymentAccountOptions.find(
		(option) => option.value === accountId,
	);

	const handleAdd = () => {
		if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
			toast.error("Informe um valor válido.");
			return;
		}

		if (!accountId) {
			toast.error("Selecione uma conta.");
			return;
		}

		startTransition(async () => {
			const result = await advanceInvoiceAction({
				cardId,
				period,
				amount: targetAmount,
				accountId,
				paymentDate: paymentDateValue,
			});

			if (result.success) {
				toast.success(result.message);
				setAmount("");
				router.refresh();
				return;
			}

			toast.error(result.error);
		});
	};

	const handleRemove = (advanceId: string) => {
		startTransition(async () => {
			const result = await removeInvoiceAdvanceAction({
				cardId,
				period,
				advanceId,
			});

			if (result.success) {
				toast.success(result.message);
				router.refresh();
				return;
			}

			toast.error(result.error);
		});
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Adiantar fatura</DialogTitle>
					<DialogDescription>
						Registre pagamentos antecipados ou parciais. Cada valor sai da conta
						escolhida e abate o total da fatura.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
						<p className="text-muted-foreground">Valor a pagar da fatura</p>
						<p className="font-medium text-foreground">
							{formatCurrency(remaining)}
						</p>
					</div>

					{advances.length > 0 ? (
						<div className="space-y-2">
							<p className="text-sm font-medium text-foreground">
								Adiantamentos deste período
							</p>
							<ul className="space-y-1.5">
								{advances.map((advance) => (
									<li
										key={advance.id}
										className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-sm"
									>
										<div className="min-w-0">
											<span className="font-medium text-foreground">
												{formatCurrency(advance.amount)}
											</span>
											<span className="text-muted-foreground">
												{" · "}
												{formatAdvanceDate(advance.date)} ·{" "}
												{advance.accountName}
											</span>
										</div>
										<Button
											type="button"
											variant="ghost"
											size="icon-sm"
											className="shrink-0 text-muted-foreground hover:text-destructive"
											disabled={isPending}
											onClick={() => handleRemove(advance.id)}
											aria-label={`Remover adiantamento de ${formatCurrency(advance.amount)}`}
										>
											<RiDeleteBinLine className="size-4" />
										</Button>
									</li>
								))}
							</ul>
						</div>
					) : null}

					<div className="space-y-3 rounded-md border border-dashed px-3 py-3">
						<p className="text-sm font-medium text-foreground">
							Novo adiantamento
						</p>
						<div className="space-y-2">
							<Label htmlFor="advance-amount">Valor</Label>
							<CurrencyInput
								id="advance-amount"
								value={amount}
								onValueChange={setAmount}
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="advance-account">Conta de origem</Label>
							<Select
								value={accountId}
								onValueChange={setAccountId}
								disabled={isPending || paymentAccountOptions.length === 0}
							>
								<SelectTrigger id="advance-account" className="w-full">
									<SelectValue placeholder="Selecione uma conta">
										{selectedAccount ? (
											<AccountCardSelectContent
												label={selectedAccount.label}
												logo={selectedAccount.logo}
											/>
										) : null}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{paymentAccountOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											<AccountCardSelectContent
												label={option.label}
												logo={option.logo}
											/>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label htmlFor="advance-date">Data</Label>
							<DatePicker
								id="advance-date"
								value={paymentDateValue}
								onChange={(value) => {
									if (value) {
										setPaymentDate(new Date(`${value}T00:00:00`));
									}
								}}
								disabled={isPending}
							/>
						</div>

						<Button
							type="button"
							className="w-full"
							onClick={handleAdd}
							disabled={isPending || paymentAccountOptions.length === 0}
						>
							{isPending ? "Salvando..." : "Adicionar adiantamento"}
						</Button>
					</div>
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => setOpen(false)}
						disabled={isPending}
					>
						Fechar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
