"use client";

import { RiEqualizerLine } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { adjustAccountBalanceAction } from "@/features/accounts/actions";
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
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { formatCurrency } from "@/shared/utils/currency";

type AdjustBalanceDialogProps = {
	accountId: string;
	period: string;
	currentBalance: number;
};

export function AdjustBalanceDialog({
	accountId,
	period,
	currentBalance,
}: AdjustBalanceDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();
	const [amount, setAmount] = useState<string>(currentBalance.toFixed(2));

	useEffect(() => {
		if (open) {
			setAmount(currentBalance.toFixed(2));
		}
	}, [open, currentBalance]);

	const targetBalance = Number(amount);
	const diff = Number.isFinite(targetBalance)
		? Math.round((targetBalance - currentBalance) * 100) / 100
		: 0;
	const diffLabel =
		diff > 0
			? `Será criado um lançamento de receita de ${formatCurrency(diff)}.`
			: diff < 0
				? `Será criado um lançamento de despesa de ${formatCurrency(Math.abs(diff))}.`
				: "Nenhum ajuste será criado — o saldo já está correto.";

	const handleSave = () => {
		if (!Number.isFinite(targetBalance)) {
			toast.error("Informe um valor válido.");
			return;
		}

		startTransition(async () => {
			const result = await adjustAccountBalanceAction({
				accountId,
				period,
				currentBalance,
				targetBalance,
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
							aria-label="Ajustar saldo"
						>
							<RiEqualizerLine className="size-4" />
						</Button>
					</DialogTrigger>
				</TooltipTrigger>
				<TooltipContent>Ajustar saldo</TooltipContent>
			</Tooltip>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Ajustar saldo</DialogTitle>
					<DialogDescription>
						Informe o saldo correto da conta ao final do período. A diferença em
						relação ao saldo atual será lançada como um ajuste.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
						<p className="text-muted-foreground">Saldo atual no sistema</p>
						<p className="font-medium text-foreground">
							{formatCurrency(currentBalance)}
						</p>
					</div>
					<div className="space-y-2">
						<Label htmlFor="adjust-balance-target">Saldo correto</Label>
						<CurrencyInput
							id="adjust-balance-target"
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
