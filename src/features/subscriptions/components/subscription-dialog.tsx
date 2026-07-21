"use client";

import * as RemixIcons from "@remixicon/react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	createSubscriptionAction,
	updateSubscriptionAction,
} from "@/features/subscriptions/actions";
import type { SubscriptionData } from "@/features/subscriptions/queries";
import { PAYMENT_METHODS } from "@/features/transactions/lib/constants";
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

const SUBSCRIPTION_ICONS = [
	{ name: "RiRepeatLine", label: "Assinatura" },
	{ name: "RiTv2Line", label: "Streaming" },
	{ name: "RiMovie2Line", label: "Filmes/Séries" },
	{ name: "RiMusic2Line", label: "Música" },
	{ name: "RiGamepadLine", label: "Jogos" },
	{ name: "RiCloudLine", label: "Nuvem" },
	{ name: "RiNewspaperLine", label: "Notícias" },
	{ name: "RiBookOpenLine", label: "Livros/Leitura" },
	{ name: "RiGraduationCapLine", label: "Educação/Cursos" },
	{ name: "RiHeartPulseLine", label: "Saúde" },
	{ name: "RiRunLine", label: "Academia" },
	{ name: "RiWifiLine", label: "Internet" },
	{ name: "RiSmartphoneLine", label: "Celular/Telefone" },
	{ name: "RiHome4Line", label: "Aluguel/Moradia" },
	{ name: "RiFlashlightLine", label: "Energia/Utilidades" },
	{ name: "RiRestaurantLine", label: "Delivery/Comida" },
	{ name: "RiCarLine", label: "Transporte" },
	{ name: "RiShieldCheckLine", label: "Seguro" },
	{ name: "RiHeart3Line", label: "Pet" },
	{ name: "RiBriefcaseLine", label: "Trabalho/Software" },
	{ name: "RiBankCardLine", label: "Assinatura paga" },
] as const;

type SimpleOption = { id: string; name: string };

interface SubscriptionDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	subscription?: SubscriptionData | null;
	accounts: SimpleOption[];
	cards: SimpleOption[];
	categories: SimpleOption[];
	payers: SimpleOption[];
	onSuccess?: () => void;
}

const toDateInputValue = (value: Date | null) =>
	value ? value.toISOString().slice(0, 10) : "";

export function SubscriptionDialog({
	open,
	onOpenChange,
	subscription,
	accounts,
	cards,
	categories,
	payers,
	onSuccess,
}: SubscriptionDialogProps) {
	const isEditing = Boolean(subscription);
	const [isPending, startTransition] = useTransition();
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const [name, setName] = useState(subscription?.name ?? "");
	const [amount, setAmount] = useState(
		subscription ? String(subscription.amount).replace(".", ",") : "",
	);
	const [paymentMethod, setPaymentMethod] = useState(
		subscription?.paymentMethod ?? PAYMENT_METHODS[0],
	);
	const [billingDay, setBillingDay] = useState(
		subscription ? String(subscription.billingDay) : "",
	);
	const [startDate, setStartDate] = useState(
		toDateInputValue(subscription?.startDate ?? new Date()),
	);
	const [endDate, setEndDate] = useState(
		toDateInputValue(subscription?.endDate ?? null),
	);
	const [accountId, setAccountId] = useState(subscription?.accountId ?? "none");
	const [cardId, setCardId] = useState(subscription?.cardId ?? "none");
	const [categoryId, setCategoryId] = useState(
		subscription?.categoryId ?? "none",
	);
	const [payerId, setPayerId] = useState(subscription?.payerId ?? "none");
	const [selectedIcon, setSelectedIcon] = useState(
		subscription?.icon ?? SUBSCRIPTION_ICONS[0].name,
	);
	const [note, setNote] = useState(subscription?.note ?? "");

	const isCardPayment = paymentMethod === "Cartão de crédito";

	const resetToInitial = () => {
		setName(subscription?.name ?? "");
		setAmount(
			subscription ? String(subscription.amount).replace(".", ",") : "",
		);
		setPaymentMethod(subscription?.paymentMethod ?? PAYMENT_METHODS[0]);
		setBillingDay(subscription ? String(subscription.billingDay) : "");
		setStartDate(toDateInputValue(subscription?.startDate ?? new Date()));
		setEndDate(toDateInputValue(subscription?.endDate ?? null));
		setAccountId(subscription?.accountId ?? "none");
		setCardId(subscription?.cardId ?? "none");
		setCategoryId(subscription?.categoryId ?? "none");
		setPayerId(subscription?.payerId ?? "none");
		setSelectedIcon(subscription?.icon ?? SUBSCRIPTION_ICONS[0].name);
		setNote(subscription?.note ?? "");
		setErrorMessage(null);
	};

	const handleOpenChange = (next: boolean) => {
		if (!next) resetToInitial();
		onOpenChange(next);
	};

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setErrorMessage(null);

		if (!name.trim()) {
			setErrorMessage("Informe o nome da assinatura.");
			return;
		}

		const parsedAmount = Number.parseFloat(amount.replace(",", "."));
		if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
			setErrorMessage("Informe um valor válido maior que zero.");
			return;
		}

		const parsedDay = Number.parseInt(billingDay, 10);
		if (
			!billingDay ||
			Number.isNaN(parsedDay) ||
			parsedDay < 1 ||
			parsedDay > 31
		) {
			setErrorMessage("Informe um dia de cobrança entre 1 e 31.");
			return;
		}

		if (!startDate) {
			setErrorMessage("Informe a data de início.");
			return;
		}

		startTransition(async () => {
			const payload = {
				name: name.trim(),
				amount: parsedAmount,
				paymentMethod,
				billingDay: parsedDay,
				startDate: new Date(startDate),
				endDate: endDate ? new Date(endDate) : null,
				icon: selectedIcon,
				note: note.trim() || null,
				accountId: !isCardPayment && accountId !== "none" ? accountId : null,
				cardId: isCardPayment && cardId !== "none" ? cardId : null,
				categoryId: categoryId !== "none" ? categoryId : null,
				payerId: payerId !== "none" ? payerId : null,
			};

			const result =
				isEditing && subscription
					? await updateSubscriptionAction({ id: subscription.id, ...payload })
					: await createSubscriptionAction(payload);

			if (result.success) {
				toast.success(result.message);
				handleOpenChange(false);
				onSuccess?.();
				return;
			}

			setErrorMessage(result.error ?? "Erro ao salvar assinatura.");
			toast.error(result.error);
		});
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{isEditing ? "Editar assinatura" : "Nova assinatura"}
					</DialogTitle>
					<DialogDescription>
						{isEditing
							? "Atualize os dados da assinatura."
							: "Cadastre uma cobrança recorrente para gerar pré-lançamentos automaticamente no Inbox."}
					</DialogDescription>
				</DialogHeader>

				<form className="flex flex-col gap-5" onSubmit={handleSubmit}>
					<div className="flex flex-col gap-2">
						<Label>Ícone</Label>
						<div className="flex flex-wrap gap-2">
							{SUBSCRIPTION_ICONS.map(({ name: iconName, label }) => {
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
											<RemixIcons.RiRepeatLine className="size-4" aria-hidden />
										)}
									</button>
								);
							})}
						</div>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="subscription-name">Nome</Label>
						<Input
							id="subscription-name"
							placeholder="Ex: Netflix"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
						/>
					</div>

					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-2">
							<Label htmlFor="subscription-amount">Valor</Label>
							<CurrencyInput
								id="subscription-amount"
								value={amount}
								onValueChange={setAmount}
								placeholder="R$ 0,00"
								required
							/>
						</div>

						<div className="flex flex-col gap-2">
							<Label htmlFor="subscription-day">Dia da cobrança</Label>
							<Input
								id="subscription-day"
								type="number"
								min={1}
								max={31}
								placeholder="Ex: 10"
								value={billingDay}
								onChange={(e) => setBillingDay(e.target.value)}
								required
							/>
						</div>
					</div>

					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-2">
							<Label htmlFor="subscription-start">Início</Label>
							<DatePicker
								id="subscription-start"
								value={startDate}
								onChange={setStartDate}
							/>
						</div>

						<div className="flex flex-col gap-2">
							<Label htmlFor="subscription-end">
								Fim{" "}
								<span className="text-muted-foreground font-normal">
									(opcional)
								</span>
							</Label>
							<DatePicker
								id="subscription-end"
								value={endDate}
								onChange={setEndDate}
							/>
						</div>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="subscription-payment-method">
							Forma de pagamento
						</Label>
						<Select value={paymentMethod} onValueChange={setPaymentMethod}>
							<SelectTrigger
								id="subscription-payment-method"
								className="w-full"
							>
								<SelectValue placeholder="Selecione" />
							</SelectTrigger>
							<SelectContent>
								{PAYMENT_METHODS.map((method) => (
									<SelectItem key={method} value={method}>
										{method}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						{isCardPayment ? (
							<div className="flex flex-col gap-2">
								<Label htmlFor="subscription-card">Cartão</Label>
								<Select value={cardId} onValueChange={setCardId}>
									<SelectTrigger id="subscription-card" className="w-full">
										<SelectValue placeholder="Selecione um cartão" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="none">Nenhum</SelectItem>
										{cards.map((card) => (
											<SelectItem key={card.id} value={card.id}>
												{card.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						) : (
							<div className="flex flex-col gap-2">
								<Label htmlFor="subscription-account">Conta</Label>
								<Select value={accountId} onValueChange={setAccountId}>
									<SelectTrigger id="subscription-account" className="w-full">
										<SelectValue placeholder="Selecione uma conta" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="none">Nenhuma</SelectItem>
										{accounts.map((account) => (
											<SelectItem key={account.id} value={account.id}>
												{account.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}

						<div className="flex flex-col gap-2">
							<Label htmlFor="subscription-category">
								Categoria{" "}
								<span className="text-muted-foreground font-normal">
									(opcional)
								</span>
							</Label>
							<Select value={categoryId} onValueChange={setCategoryId}>
								<SelectTrigger id="subscription-category" className="w-full">
									<SelectValue placeholder="Selecione" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">Nenhuma</SelectItem>
									{categories.map((category) => (
										<SelectItem key={category.id} value={category.id}>
											{category.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="subscription-payer">
							Pessoa{" "}
							<span className="text-muted-foreground font-normal">
								(opcional)
							</span>
						</Label>
						<Select value={payerId} onValueChange={setPayerId}>
							<SelectTrigger id="subscription-payer" className="w-full">
								<SelectValue placeholder="Selecione" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">Nenhuma</SelectItem>
								{payers.map((payer) => (
									<SelectItem key={payer.id} value={payer.id}>
										{payer.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="subscription-note">
							Anotação{" "}
							<span className="text-muted-foreground font-normal">
								(opcional)
							</span>
						</Label>
						<Textarea
							id="subscription-note"
							placeholder="Ex: Plano família"
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
									: "Criar assinatura"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
