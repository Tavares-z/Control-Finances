"use client";

import { RiBankLine, RiLink } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	type ConnectionCreditCard,
	linkConnectionCardAction,
	listConnectionCreditCardsAction,
} from "@/features/openfinance/actions";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Skeleton } from "@/shared/components/ui/skeleton";

interface CardOpenFinanceDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	cardId: string;
	cardName: string;
	/** True se o usuário tem ao menos 1 conexão (decide o estado vazio inicial). */
	hasConnections: boolean;
}

/** Valor do Select: connectionId + pluggyAccountId (o cartão específico). */
function encodeCardValue(card: ConnectionCreditCard): string {
	return `${card.connectionId}:${card.pluggyAccountId}`;
}

/**
 * Dialog de vínculo de um CARTÃO local a um cartão Pluggy (Fase 2).
 *
 * A conexão (o banco) é criada na aba de Configurações; aqui o usuário escolhe
 * QUAL cartão Pluggy amarrar a este cartão local. Ao abrir, busca na Pluggy os
 * cartões CREDIT de todas as conexões e os lista já pelo NOME do cartão — resolve
 * o caso de várias conexões "MeuPluggy" indistinguíveis (connectorName é
 * compartilhado no uso pessoal). Cada opção carrega (connectionId, pluggyAccountId),
 * então o vínculo já é do cartão específico — sem 2º passo de desambiguação.
 */
export function CardOpenFinanceDialog({
	open,
	onOpenChange,
	cardId,
	cardName,
	hasConnections,
}: CardOpenFinanceDialogProps) {
	const router = useRouter();
	const [isLinking, startLinking] = useTransition();
	const [isLoading, setIsLoading] = useState(false);
	const [cards, setCards] = useState<ConnectionCreditCard[]>([]);
	const [loadError, setLoadError] = useState(false);
	const [selectedValue, setSelectedValue] = useState<string>("");

	// Ao abrir, busca os cartões Pluggy (CREDIT) de todas as conexões do usuário.
	useEffect(() => {
		if (!open || !hasConnections) return;
		let cancelled = false;
		setIsLoading(true);
		setLoadError(false);
		listConnectionCreditCardsAction().then((result) => {
			if (cancelled) return;
			if (!result.success || !result.data) {
				setLoadError(true);
				setCards([]);
			} else {
				setCards(result.data.cards);
			}
			setIsLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [open, hasConnections]);

	const handleSelect = (value: string) => {
		setSelectedValue(value);
		const card = cards.find((c) => encodeCardValue(c) === value);
		if (!card) return;
		startLinking(async () => {
			const result = await linkConnectionCardAction({
				connectionId: card.connectionId,
				localCardId: cardId,
				pluggyAccountId: card.pluggyAccountId,
			});
			if (!result.success) {
				toast.error(result.error ?? "Não foi possível vincular o cartão.");
				return;
			}
			toast.success(result.message ?? "Cartão vinculado.");
			onOpenChange(false);
			router.refresh();
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Puxar fatura via Open Finance</DialogTitle>
					<DialogDescription>
						Escolha o cartão do banco conectado que corresponde ao{" "}
						<strong>{cardName}</strong>. Os lançamentos passarão a ser
						importados automaticamente para a fatura deste cartão.
					</DialogDescription>
				</DialogHeader>

				{!hasConnections ? (
					<div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-8 text-center">
						<RiBankLine
							className="size-8 text-muted-foreground"
							aria-hidden="true"
						/>
						<p className="font-medium">Nenhum banco conectado</p>
						<p className="max-w-xs text-sm text-muted-foreground">
							Conecte um banco em Ajustes → Open Finance antes de vincular o
							cartão.
						</p>
					</div>
				) : isLoading ? (
					<div className="space-y-2">
						<Skeleton className="h-4 w-24" />
						<Skeleton className="h-10 w-full" />
						<p className="text-sm text-muted-foreground">
							Buscando seus cartões no banco…
						</p>
					</div>
				) : loadError ? (
					<p className="text-sm text-destructive">
						Não foi possível carregar os cartões do banco. Tente novamente em
						instantes.
					</p>
				) : cards.length === 0 ? (
					<div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-8 text-center">
						<RiBankLine
							className="size-8 text-muted-foreground"
							aria-hidden="true"
						/>
						<p className="font-medium">Nenhum cartão encontrado</p>
						<p className="max-w-xs text-sm text-muted-foreground">
							Os bancos conectados não expõem nenhum cartão de crédito pelo Open
							Finance.
						</p>
					</div>
				) : (
					<div className="space-y-2">
						<label
							htmlFor={`card-of-select-${cardId}`}
							className="text-sm text-muted-foreground"
						>
							Cartão do banco
						</label>
						<Select
							value={selectedValue}
							onValueChange={handleSelect}
							disabled={isLinking}
						>
							<SelectTrigger id={`card-of-select-${cardId}`} className="w-full">
								<SelectValue placeholder="Selecione o cartão" />
							</SelectTrigger>
							<SelectContent>
								{cards.map((card) => (
									<SelectItem
										key={encodeCardValue(card)}
										value={encodeCardValue(card)}
									>
										{(() => {
											const bank = card.nickname || card.connectorName;
											return bank
												? `${bank} · ${card.cardName}`
												: card.cardName;
										})()}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{isLinking && (
							<p className="inline-flex items-center gap-1 text-sm text-muted-foreground">
								<RiLink className="size-4 animate-pulse" aria-hidden="true" />
								Vinculando…
							</p>
						)}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
