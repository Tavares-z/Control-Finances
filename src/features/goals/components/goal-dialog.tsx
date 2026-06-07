"use client";

import * as RemixIcons from "@remixicon/react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createGoalAction, updateGoalAction } from "@/features/goals/actions";
import type { GoalData } from "@/features/goals/queries";
import type { AccountData } from "@/features/accounts/queries";
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
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import { getIconComponent } from "@/shared/utils/icons";
import { cn } from "@/shared/utils/ui";

const GOAL_ICONS = [
	{ name: "RiSaveLine", label: "Poupança" },
	{ name: "RiHome4Line", label: "Casa" },
	{ name: "RiCarLine", label: "Carro" },
	{ name: "RiPlaneLine", label: "Viagem" },
	{ name: "RiGraduationCapLine", label: "Educação" },
	{ name: "RiHeartLine", label: "Saúde" },
	{ name: "RiSmartphoneLine", label: "Tecnologia" },
	{ name: "RiShoppingBag2Line", label: "Compras" },
	{ name: "RiMedalLine", label: "Conquista" },
	{ name: "RiPlantLine", label: "Investimento" },
	{ name: "RiBriefcase4Line", label: "Negócio" },
	{ name: "RiEmotionHappyLine", label: "Lazer" },
] as const;

interface GoalDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	goal?: GoalData | null;
	accounts: AccountData[];
	onSuccess?: () => void;
}

export function GoalDialog({
	open,
	onOpenChange,
	goal,
	accounts,
	onSuccess,
}: GoalDialogProps) {
	const isEditing = Boolean(goal);
	const [isPending, startTransition] = useTransition();
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const [name, setName] = useState(goal?.name ?? "");
	const [targetAmount, setTargetAmount] = useState(
		goal ? String(goal.targetAmount).replace(".", ",") : "",
	);
	const [accountId, setAccountId] = useState(goal?.accountId ?? "none");
	const [deadline, setDeadline] = useState(
		goal?.deadline
			? goal.deadline.toISOString().slice(0, 10)
			: "",
	);
	const [selectedIcon, setSelectedIcon] = useState(
		goal?.icon ?? GOAL_ICONS[0].name,
	);
	const [note, setNote] = useState(goal?.note ?? "");

	const handleOpenChange = (next: boolean) => {
		if (!next) {
			setName(goal?.name ?? "");
			setTargetAmount(
				goal ? String(goal.targetAmount).replace(".", ",") : "",
			);
			setAccountId(goal?.accountId ?? "none");
			setDeadline(
				goal?.deadline ? goal.deadline.toISOString().slice(0, 10) : "",
			);
			setSelectedIcon(goal?.icon ?? GOAL_ICONS[0].name);
			setNote(goal?.note ?? "");
			setErrorMessage(null);
		}
		onOpenChange(next);
	};

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setErrorMessage(null);

		if (!name.trim()) {
			setErrorMessage("Informe o nome da meta.");
			return;
		}

		const parsed = Number.parseFloat(targetAmount.replace(",", "."));
		if (!targetAmount || Number.isNaN(parsed) || parsed <= 0) {
			setErrorMessage("Informe um valor alvo válido maior que zero.");
			return;
		}

		startTransition(async () => {
			const payload = {
				name: name.trim(),
				targetAmount: parsed,
				accountId: accountId !== "none" ? accountId : null,
				deadline: deadline ? new Date(deadline) : null,
				icon: selectedIcon,
				note: note.trim() || null,
			};

			const result = isEditing && goal
				? await updateGoalAction({ id: goal.id, ...payload })
				: await createGoalAction(payload);

			if (result.success) {
				toast.success(result.message);
				handleOpenChange(false);
				onSuccess?.();
				return;
			}

			setErrorMessage(result.error ?? "Erro ao salvar meta.");
			toast.error(result.error);
		});
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{isEditing ? "Editar meta" : "Nova meta financeira"}
					</DialogTitle>
					<DialogDescription>
						{isEditing
							? "Atualize os dados da sua meta."
							: "Defina um objetivo financeiro e acompanhe seu progresso."}
					</DialogDescription>
				</DialogHeader>

				<form className="flex flex-col gap-5" onSubmit={handleSubmit}>
					{/* Ícone */}
					<div className="flex flex-col gap-2">
						<Label>Ícone</Label>
						<div className="flex flex-wrap gap-2">
							{GOAL_ICONS.map(({ name: iconName, label }) => {
								const Icon = getIconComponent(iconName);
								return (
									<button
										key={iconName}
										type="button"
										title={label}
										onClick={() => setSelectedIcon(iconName)}
										className={cn(
											"flex size-9 items-center justify-center rounded-lg border transition-colors",
											selectedIcon === iconName
												? "border-primary bg-primary/10 text-primary"
												: "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground",
										)}
									>
										{Icon ? (
											<Icon className="size-4" aria-hidden />
										) : (
											<RemixIcons.RiSaveLine className="size-4" aria-hidden />
										)}
									</button>
								);
							})}
						</div>
					</div>

					{/* Nome */}
					<div className="flex flex-col gap-2">
						<Label htmlFor="goal-name">Nome da meta</Label>
						<Input
							id="goal-name"
							placeholder="Ex: Reserva de emergência"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
						/>
					</div>

					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						{/* Valor alvo */}
						<div className="flex flex-col gap-2">
							<Label htmlFor="goal-amount">Valor alvo</Label>
							<CurrencyInput
								id="goal-amount"
								value={targetAmount}
								onValueChange={setTargetAmount}
								placeholder="R$ 0,00"
								required
							/>
						</div>

						{/* Prazo */}
						<div className="flex flex-col gap-2">
							<Label htmlFor="goal-deadline">
								Prazo{" "}
								<span className="text-muted-foreground font-normal">
									(opcional)
								</span>
							</Label>
							<DatePicker
								id="goal-deadline"
								value={deadline}
								onChange={setDeadline}
							/>
						</div>
					</div>

					{/* Conta vinculada */}
					<div className="flex flex-col gap-2">
						<Label htmlFor="goal-account">
							Conta vinculada{" "}
							<span className="text-muted-foreground font-normal">
								(opcional)
							</span>
						</Label>
						<Select value={accountId} onValueChange={setAccountId}>
							<SelectTrigger id="goal-account" className="w-full">
								<SelectValue placeholder="Selecione uma conta" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">Nenhuma</SelectItem>
								{accounts.map((acc) => (
									<SelectItem key={acc.id} value={acc.id}>
										{acc.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-xs text-muted-foreground">
							O progresso será calculado automaticamente pelo saldo da conta.
						</p>
					</div>

					{/* Anotação */}
					<div className="flex flex-col gap-2">
						<Label htmlFor="goal-note">
							Anotação{" "}
							<span className="text-muted-foreground font-normal">
								(opcional)
							</span>
						</Label>
						<Textarea
							id="goal-note"
							placeholder="Ex: Meta para quitar o financiamento"
							value={note}
							onChange={(e) => setNote(e.target.value)}
							className="resize-none"
							rows={2}
						/>
					</div>

					{errorMessage && (
						<p className="text-sm text-destructive">{errorMessage}</p>
					)}

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => handleOpenChange(false)}
							disabled={isPending}
						>
							Cancelar
						</Button>
						<Button type="submit" disabled={isPending}>
							{isPending
								? "Salvando..."
								: isEditing
									? "Salvar alterações"
									: "Criar meta"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}