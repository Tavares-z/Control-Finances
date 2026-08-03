"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { advanceInvoiceAction } from "@/features/invoices/actions";
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
	/** Quanto já foi adiantado neste período (0 se ainda não houver). */
	advancedAmount: number;
	defaultPaymentAccountId: string | null;
	paymentAccountOptions: PaymentAccountOption[];
};

export function AdvanceInvoiceDialog({
	trigger,
	cardId,
	period,
	currentTotal,
	advancedAmount,
	defaultPaymentAccountId,
	paymentAccountOptions,
}: AdvanceInvoiceDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();

	const hasAdvance = advancedAmount > 0;
	const remaining = Math.abs(currentTotal);

	const [amount, setAmount] = useState<string>(advancedAmount.toFixed(2));
	const [accountId, setAccountId] = useState<string>(
		defaultPaymentAccountId ?? paymentAccountOptions[0]?.value ?? "",
	);
	const [paymentDate, setPaymentDate] = useState<Date>(new Date());

	useEffect(() => {
		if (open) {
			setAmount(advancedAmount.toFixed(2));
			setAccountId(
				defaultPaymentAccountId ?? paymentAccountOptions[0]?.value ?? "",
			);
			setPaymentDate(new Date());
		}
	}, [open, advancedAmount, defaultPaymentAccountId, paymentAccountOptions]);

	const targetAmount = Number(amount);
	const paymentDateValue = paymentDate.toISOString().split("T")[0] ?? "";
	const selectedAccount = paymentAccountOptions.find(
		(option) => option.value === accountId,
	);

	const helperLabel = !Number.isFinite(targetAmount)
		? "Informe um valor."
		: targetAmount === 0
			? hasAdvance
				? "O adiantamento deste período será removido."
				: "Informe quanto deseja adiantar."
			: `Sairão ${formatCurrency(targetAmount)} da conta e o valor da fatura será abatido.`;

	const handleSave = () => {
		if (!Number.isFinite(targetAmount) || targetAmount < 0) {
			toast.error("Informe um valor válido.");
			return;
		}

		if (targetAmount > 0 && !accountId) {
			toast.error("Selecione uma conta para o adiantamento.");
			return;
		}

		startTransition(async () => {
			const result = await advanceInvoiceAction({
				cardId,
				period,
				amount: targetAmount,
				accountId: targetAmount > 0 ? accountId : undefined,
				paymentDate:
					targetAmount > 0 ? (paymentDateValue ?? undefined) : undefined,
			});

			if (result.success) {
				toast.success(result.message);
				setOpen(false);
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
						Registre um pagamento antecipado ou parcial. O valor sai da conta
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

					<div className="space-y-2">
						<Label htmlFor="advance-amount">Valor a adiantar</Label>
						<CurrencyInput
							id="advance-amount"
							value={amount}
							onValueChange={setAmount}
							autoFocus
						/>
						<p className="text-xs text-muted-foreground">{helperLabel}</p>
					</div>

					{targetAmount > 0 ? (
						<>
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
								<Label htmlFor="advance-date">Data do adiantamento</Label>
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
						</>
					) : null}
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => setOpen(false)}
						disabled={isPending}
					>
						Cancelar
					</Button>
					<Button type="button" onClick={handleSave} disabled={isPending}>
						{isPending ? "Salvando..." : "Salvar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
