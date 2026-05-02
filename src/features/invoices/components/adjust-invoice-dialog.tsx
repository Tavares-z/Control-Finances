"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { adjustInvoiceAction } from "@/features/invoices/actions";
import { Button } from "@/shared/components/ui/button";
import { CurrencyInput } from "@/shared/components/ui/currency-input";
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
import { formatCurrency } from "@/shared/utils/currency";

type AdjustInvoiceDialogProps = {
	trigger: React.ReactNode;
	cardId: string;
	period: string;
	currentTotal: number;
};

export function AdjustInvoiceDialog({
	trigger,
	cardId,
	period,
	currentTotal,
}: AdjustInvoiceDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();
	const currentAbs = Math.abs(currentTotal);
	const [amount, setAmount] = useState<string>(currentAbs.toFixed(2));

	useEffect(() => {
		if (open) {
			setAmount(currentAbs.toFixed(2));
		}
	}, [open, currentAbs]);

	const targetAmount = Number(amount);
	const diff = Number.isFinite(targetAmount)
		? Math.round((targetAmount - currentAbs) * 100) / 100
		: 0;
	const diffLabel =
		diff > 0
			? `Será criado um lançamento de despesa de ${formatCurrency(diff)}.`
			: diff < 0
				? `Será criado um lançamento de receita de ${formatCurrency(Math.abs(diff))}.`
				: "Nenhum ajuste será criado — o valor já está correto.";

	const handleSave = () => {
		if (!Number.isFinite(targetAmount) || targetAmount < 0) {
			toast.error("Informe um valor válido.");
			return;
		}

		startTransition(async () => {
			const result = await adjustInvoiceAction({
				cardId,
				period,
				currentTotal,
				targetAmount,
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
					<DialogTitle>Ajustar fatura</DialogTitle>
					<DialogDescription>
						Informe o valor real da fatura. A diferença em relação ao total
						atual será lançada como um ajuste no período.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
						<p className="text-muted-foreground">Total atual no sistema</p>
						<p className="font-medium text-foreground">
							{formatCurrency(currentAbs)}
						</p>
					</div>
					<div className="space-y-2">
						<Label htmlFor="adjust-target">Valor correto da fatura</Label>
						<CurrencyInput
							id="adjust-target"
							value={amount}
							onValueChange={setAmount}
							autoFocus
						/>
						<p className="text-xs text-muted-foreground">{diffLabel}</p>
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
						{isPending ? "Salvando..." : "Salvar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
