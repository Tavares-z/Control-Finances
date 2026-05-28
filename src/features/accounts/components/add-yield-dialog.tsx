"use client";

import { RiCalculatorLine, RiFundsLine } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { addAccountYieldAction } from "@/features/accounts/actions";
import { CalculatorDialogButton } from "@/shared/components/calculator/calculator-dialog";
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
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";

type AddYieldDialogProps = {
	accountId: string;
	defaultDate: string;
};

export function AddYieldDialog({
	accountId,
	defaultDate,
}: AddYieldDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();
	const [amount, setAmount] = useState("");
	const [date, setDate] = useState(defaultDate);

	useEffect(() => {
		if (open) {
			setAmount("");
			setDate(defaultDate);
		}
	}, [open, defaultDate]);

	const handleSave = () => {
		const numericAmount = Number(amount);

		if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
			toast.error("Informe um valor maior que zero.");
			return;
		}

		if (!date) {
			toast.error("Informe a data do rendimento.");
			return;
		}

		startTransition(async () => {
			const result = await addAccountYieldAction({
				accountId,
				amount: numericAmount,
				date,
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
			<Tooltip>
				<TooltipTrigger asChild>
					<DialogTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							className="text-primary hover:text-primary"
							aria-label="Adicionar rendimento"
						>
							<RiFundsLine className="size-4" />
						</Button>
					</DialogTrigger>
				</TooltipTrigger>
				<TooltipContent>Adicionar rendimento</TooltipContent>
			</Tooltip>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Adicionar rendimento</DialogTitle>
					<DialogDescription>
						Registre um rendimento como receita paga nesta conta.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="yield-amount">Valor</Label>
						<div className="relative">
							<CurrencyInput
								id="yield-amount"
								value={amount}
								onValueChange={setAmount}
								autoFocus
								className="pr-10"
								placeholder="R$ 0,00"
							/>
							<CalculatorDialogButton
								variant="ghost"
								size="icon-sm"
								className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
								onSelectValue={setAmount}
							>
								<RiCalculatorLine className="h-4 w-4 text-muted-foreground" />
							</CalculatorDialogButton>
						</div>
					</div>
					<div className="space-y-2">
						<Label htmlFor="yield-date">Data</Label>
						<DatePicker
							id="yield-date"
							value={date}
							onChange={setDate}
							placeholder="Data"
							required
						/>
					</div>
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
						{isPending ? "Salvando..." : "Adicionar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
