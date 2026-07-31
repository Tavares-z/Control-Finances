"use client";

import { RiBankLine, RiLink } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	linkConnectionCardAction,
	type PluggyAccountOption,
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

/** Conexão Open Finance disponível para vincular a um cartão. */
export interface LinkableConnection {
	id: string;
	connectorName: string | null;
}

interface CardOpenFinanceDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	cardId: string;
	cardName: string;
	connections: LinkableConnection[];
}

/**
 * Dialog de vínculo de um CARTÃO local a uma conexão Open Finance (Fase 2).
 *
 * A conexão (o banco) é criada na aba de Configurações — aqui o usuário só ESCOLHE
 * qual conexão já existente amarrar a este cartão. A `linkConnectionCardAction`
 * resolve o cartão-Pluggy: colapsa se o item tem 1 cartão CREDIT, ou devolve
 * `needsPluggyChoice` (2+), quando renderizamos um 2º Select.
 */
export function CardOpenFinanceDialog({
	open,
	onOpenChange,
	cardId,
	cardName,
	connections,
}: CardOpenFinanceDialogProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [selectedConnectionId, setSelectedConnectionId] = useState<string>("");
	const [pluggyOptions, setPluggyOptions] = useState<PluggyAccountOption[]>([]);

	const runLink = (connectionId: string, pluggyAccountId?: string) => {
		startTransition(async () => {
			const result = await linkConnectionCardAction({
				connectionId,
				localCardId: cardId,
				pluggyAccountId,
			});
			if (!result.success) {
				toast.error(result.error ?? "Não foi possível vincular o cartão.");
				return;
			}
			if (result.data?.needsPluggyChoice) {
				setPluggyOptions(result.data.options);
				return;
			}
			setPluggyOptions([]);
			toast.success(result.message ?? "Cartão vinculado.");
			onOpenChange(false);
			router.refresh();
		});
	};

	const handleConnectionChange = (value: string) => {
		setSelectedConnectionId(value);
		setPluggyOptions([]); // troca de conexão reinicia a desambiguação
		runLink(value);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Puxar fatura via Open Finance</DialogTitle>
					<DialogDescription>
						Escolha o banco conectado que emite o cartão{" "}
						<strong>{cardName}</strong>. Os lançamentos passarão a ser
						importados automaticamente para a fatura deste cartão.
					</DialogDescription>
				</DialogHeader>

				{connections.length === 0 ? (
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
				) : (
					<div className="space-y-3">
						<div className="space-y-2">
							<label
								htmlFor={`card-of-connection-${cardId}`}
								className="text-sm text-muted-foreground"
							>
								Banco conectado
							</label>
							<Select
								value={selectedConnectionId}
								onValueChange={handleConnectionChange}
								disabled={isPending}
							>
								<SelectTrigger
									id={`card-of-connection-${cardId}`}
									className="w-full"
								>
									<SelectValue placeholder="Selecione um banco" />
								</SelectTrigger>
								<SelectContent>
									{connections.map((connection) => (
										<SelectItem key={connection.id} value={connection.id}>
											{connection.connectorName || "Instituição"}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{pluggyOptions.length > 0 && (
							<div className="space-y-2">
								<p className="text-sm text-warning">
									Escolha o cartão neste banco para concluir.
								</p>
								<label
									htmlFor={`card-of-pluggy-${cardId}`}
									className="text-sm text-muted-foreground"
								>
									Qual cartão neste banco?
								</label>
								<Select
									onValueChange={(pluggyAccountId) =>
										runLink(selectedConnectionId, pluggyAccountId)
									}
									disabled={isPending}
								>
									<SelectTrigger
										id={`card-of-pluggy-${cardId}`}
										className="w-full"
									>
										<SelectValue placeholder="Selecione o cartão" />
									</SelectTrigger>
									<SelectContent>
										{pluggyOptions.map((option) => (
											<SelectItem
												key={option.pluggyAccountId}
												value={option.pluggyAccountId}
											>
												{option.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}

						{isPending && (
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
