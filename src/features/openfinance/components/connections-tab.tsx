"use client";

import {
	RiAlertLine,
	RiBankLine,
	RiCheckboxCircleLine,
	RiErrorWarningLine,
	RiTimeLine,
} from "@remixicon/react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	createConnectTokenAction,
	disconnectConnectionAction,
	linkConnectionAccountAction,
	type PluggyAccountOption,
	reconnectConnectionAction,
	registerConnectionAction,
	renameConnectionAction,
} from "@/features/openfinance/actions";
import type { OpenFinanceConnectionListItem } from "@/features/openfinance/queries";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { formatDateTime } from "@/shared/utils/date";

// Widget browser-only: carregado via dynamic ssr:false para não rodar no SSR
// do App Router (o pluggy-connect-sdk depende de APIs de janela).
const PluggyConnect = dynamic(
	() => import("react-pluggy-connect").then((m) => m.PluggyConnect),
	{ ssr: false },
);

/** Conta local mínima para o dropdown de vínculo (id + nome). */
export interface LinkableAccount {
	id: string;
	name: string;
}

interface ConnectionsTabProps {
	connections: OpenFinanceConnectionListItem[];
	/** Habilita conectores sandbox no widget (staging). Prod: false por padrão. */
	includeSandbox: boolean;
	/** Contas locais vinculáveis (já sem VR/VA — filtrado no servidor). */
	linkableAccounts: LinkableAccount[];
}

type BadgeVariant = "success" | "destructive" | "warning" | "secondary";

// Deriva o badge do ESTADO REAL da conexão, não do status cru (que hoje só é
// gravado no caminho de erro do sync — ver F1.3 / A2). Precedência: erro de
// login > desatualizada > já sincronizou > nunca sincronizou. Os ramos de status
// cru (LOGIN_ERROR/OUTDATED) vêm ANTES do check de lastSyncedAt de propósito:
// uma conexão que já sincronizou tem lastSyncedAt setado, então um ramo de
// status colocado depois nunca dispararia.
function getStatusBadge(
	status: string | null,
	lastSyncedAt: Date | null,
): {
	variant: BadgeVariant;
	label: string;
	Icon: typeof RiCheckboxCircleLine;
} {
	if (status === "LOGIN_ERROR") {
		return {
			variant: "destructive",
			label: "Erro de login",
			Icon: RiErrorWarningLine,
		};
	}
	// OUTDATED: item parou de atualizar (consentimento por vencer, banco fora,
	// etc.). Não é erro duro de login, mas é acionável — badge de aviso + o mesmo
	// botão Reconectar, que costuma curar o estado com nova autenticação.
	if (status === "OUTDATED") {
		return {
			variant: "warning",
			label: "Desatualizada",
			Icon: RiAlertLine,
		};
	}
	if (lastSyncedAt != null) {
		return {
			variant: "success",
			label: "Sincronizada",
			Icon: RiCheckboxCircleLine,
		};
	}
	return {
		variant: "secondary",
		label: "Aguardando sincronização",
		Icon: RiTimeLine,
	};
}

/**
 * Campo de apelido de UMA conexão. No uso pessoal o connectorName é "MeuPluggy"
 * para todas — o apelido ("Nubank", "Santander") é o que identifica a conexão no
 * dropdown de vínculo de cartão. Salva ao sair do campo (onBlur) quando mudou.
 */
function ConnectionNicknameControl({
	connection,
}: {
	connection: OpenFinanceConnectionListItem;
}) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [value, setValue] = useState(connection.nickname ?? "");

	const inputId = `connection-nickname-${connection.id}`;
	const original = connection.nickname ?? "";

	const save = () => {
		if (value.trim() === original) return; // nada mudou
		startTransition(async () => {
			const result = await renameConnectionAction({
				connectionId: connection.id,
				nickname: value,
			});
			if (!result.success) {
				toast.error(result.error ?? "Não foi possível salvar o apelido.");
				return;
			}
			toast.success(result.message ?? "Apelido salvo.");
			router.refresh();
		});
	};

	return (
		<div className="space-y-2">
			<label htmlFor={inputId} className="text-sm text-muted-foreground">
				Apelido da conexão
			</label>
			<Input
				id={inputId}
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onBlur={save}
				maxLength={40}
				placeholder="Ex.: Nubank, Santander…"
				disabled={isPending}
			/>
		</div>
	);
}

/**
 * Controle de vínculo de UMA conexão. Dropdown de conta local; quando o banco
 * tem 2+ contas BANK, a action devolve as opções e este componente renderiza
 * um 2º Select condicional (desambiguação) antes de gravar.
 */
function LinkAccountControl({
	connection,
	linkableAccounts,
}: {
	connection: OpenFinanceConnectionListItem;
	linkableAccounts: LinkableAccount[];
}) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	// Conta local escolhida (persiste entre o 1º e o 2º passo da desambiguação).
	const [selectedAccountId, setSelectedAccountId] = useState<string>(
		connection.accountId ?? "",
	);
	// Opções do 2º nível; não-vazio = precisa escolher a conta Pluggy.
	const [pluggyOptions, setPluggyOptions] = useState<PluggyAccountOption[]>([]);

	const isLinked = connection.accountId !== null;

	const runLink = (localAccountId: string, pluggyAccountId?: string) => {
		startTransition(async () => {
			const result = await linkConnectionAccountAction({
				connectionId: connection.id,
				localAccountId,
				pluggyAccountId,
			});
			if (!result.success) {
				toast.error(result.error ?? "Não foi possível vincular a conta.");
				return;
			}
			if (result.data?.needsPluggyChoice) {
				// 2+ contas BANK: pede a escolha do 2º nível.
				setPluggyOptions(result.data.options);
				return;
			}
			setPluggyOptions([]);
			toast.success(result.message ?? "Conta vinculada.");
			router.refresh();
		});
	};

	const handleAccountChange = (value: string) => {
		setSelectedAccountId(value);
		setPluggyOptions([]); // troca de conta reinicia a desambiguação
		runLink(value);
	};

	const selectId = `link-account-${connection.id}`;
	const pluggyId = `link-pluggy-${connection.id}`;

	return (
		<div className="space-y-2">
			<label htmlFor={selectId} className="text-sm text-muted-foreground">
				{isLinked ? "Trocar conta vinculada" : "Vincular a uma conta"}
			</label>
			<Select
				value={selectedAccountId}
				onValueChange={handleAccountChange}
				disabled={isPending || linkableAccounts.length === 0}
			>
				<SelectTrigger id={selectId} className="w-full">
					<SelectValue placeholder="Selecione uma conta" />
				</SelectTrigger>
				<SelectContent>
					{linkableAccounts.map((account) => (
						<SelectItem key={account.id} value={account.id}>
							{account.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			{pluggyOptions.length > 0 && (
				<div className="space-y-1">
					<p className="text-sm text-warning">
						Escolha a conta do banco para concluir o vínculo.
					</p>
					<label htmlFor={pluggyId} className="text-sm text-muted-foreground">
						Qual conta neste banco?
					</label>
					<Select
						onValueChange={(pluggyAccountId) =>
							runLink(selectedAccountId, pluggyAccountId)
						}
						disabled={isPending}
					>
						<SelectTrigger id={pluggyId} className="w-full">
							<SelectValue placeholder="Selecione a conta do banco" />
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

			{linkableAccounts.length === 0 && (
				<p className="text-sm text-muted-foreground">
					Cadastre uma conta para poder vincular.
				</p>
			)}
		</div>
	);
}

export function ConnectionsTab({
	connections,
	includeSandbox,
	linkableAccounts,
}: ConnectionsTabProps) {
	const router = useRouter();
	const [isTokenPending, startTokenTransition] = useTransition();
	const [isMutating, startMutation] = useTransition();
	const [connectToken, setConnectToken] = useState<string | null>(null);
	const [toDisconnect, setToDisconnect] =
		useState<OpenFinanceConnectionListItem | null>(null);

	const handleConnect = () => {
		startTokenTransition(async () => {
			const result = await createConnectTokenAction();
			if (!result.success || !result.data) {
				toast.error(result.error ?? "Não foi possível iniciar a conexão.");
				return;
			}
			// accessToken NUNCA logado — dá acesso ao widget.
			setConnectToken(result.data.accessToken);
		});
	};

	const handleWidgetSuccess = (data: {
		item: { id: string; connector?: { name?: string | null } | null };
	}) => {
		const pluggyItemId = data.item.id;
		const connectorName = data.item.connector?.name ?? undefined;
		setConnectToken(null);
		startMutation(async () => {
			const result = await registerConnectionAction({
				pluggyItemId,
				connectorName,
			});
			if (result.success) {
				toast.success(result.message ?? "Banco conectado.");
				router.refresh();
			} else {
				toast.error(result.error ?? "Não foi possível registrar a conexão.");
			}
		});
	};

	const handleWidgetError = () => {
		setConnectToken(null);
		toast.error("Não foi possível concluir a conexão com o banco.");
	};

	// Reconexão: abre o widget em modo UPDATE do item existente. Reusa o mesmo
	// connectToken state e, por consequência, os mesmos onSuccess/onError/onClose
	// do <PluggyConnect> — o registerConnectionAction do onSuccess é idempotente
	// por (user, item), então concluir só atualiza a conexão existente.
	const handleReconnect = (itemId: string) => {
		startTokenTransition(async () => {
			const result = await reconnectConnectionAction(itemId);
			if (!result.success || !result.data) {
				toast.error(result.error ?? "Não foi possível iniciar a reconexão.");
				return;
			}
			// accessToken NUNCA logado — dá acesso ao widget.
			setConnectToken(result.data.accessToken);
		});
	};

	const handleDisconnect = () => {
		if (!toDisconnect) return;
		const connectionId = toDisconnect.id;
		startMutation(async () => {
			const result = await disconnectConnectionAction({ connectionId });
			if (result.success) {
				toast.success(result.message ?? "Conexão desconectada.");
				setToDisconnect(null);
				router.refresh();
			} else {
				toast.error(result.error ?? "Não foi possível desconectar a conexão.");
			}
		});
	};

	return (
		<div className="space-y-4">
			{connections.length === 0 ? (
				<div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center">
					<RiBankLine
						className="size-8 text-muted-foreground"
						aria-hidden="true"
					/>
					<p className="font-medium">Nenhuma conexão bancária</p>
					<p className="max-w-sm text-sm text-muted-foreground">
						Conecte uma conta via Open Finance para importar seus lançamentos
						automaticamente para a Caixa de entrada.
					</p>
				</div>
			) : (
				<ul className="space-y-3">
					{connections.map((connection) => {
						const status = getStatusBadge(
							connection.status,
							connection.lastSyncedAt,
						);
						const lastSync = formatDateTime(connection.lastSyncedAt);
						const consentDate = formatDateTime(connection.consentExpiresAt, {
							day: "2-digit",
							month: "2-digit",
							year: "numeric",
						});
						// Título compõe conector + conta local vinculada para desambiguar
						// vários cards do mesmo conector (ex. 4x "MeuPluggy" em prod).
						const institution =
							connection.nickname || connection.connectorName || "Instituição";
						const title = connection.accountName
							? `${institution} · ${connection.accountName}`
							: institution;

						return (
							<li
								key={connection.id}
								className="rounded-lg border border-border bg-card p-4"
							>
								<div className="flex items-start justify-between gap-3">
									<div className="flex min-w-0 items-center gap-2">
										<RiBankLine
											className="size-5 shrink-0 text-muted-foreground"
											aria-hidden="true"
										/>
										<span className="truncate font-medium" title={title}>
											{title}
										</span>
									</div>
									<Badge variant={status.variant}>
										<status.Icon aria-hidden="true" />
										{status.label}
									</Badge>
								</div>

								<div className="mt-3 space-y-1 text-sm text-muted-foreground">
									<p>
										{lastSync
											? `Última sincronização: ${lastSync}`
											: "Nunca sincronizada"}
									</p>
									{consentDate && <p>Consentimento expira em {consentDate}</p>}
								</div>

								<div className="mt-3">
									<ConnectionNicknameControl connection={connection} />
								</div>

								<div className="mt-3">
									<LinkAccountControl
										connection={connection}
										linkableAccounts={linkableAccounts}
									/>
								</div>

								<div className="mt-3 flex justify-end gap-2">
									{(status.variant === "destructive" ||
										status.variant === "warning") && (
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => handleReconnect(connection.pluggyItemId)}
											disabled={isTokenPending || isMutating}
										>
											{isTokenPending ? "Abrindo…" : "Reconectar"}
										</Button>
									)}
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="text-destructive hover:bg-destructive/10 hover:text-destructive"
										onClick={() => setToDisconnect(connection)}
										disabled={isMutating}
									>
										Desconectar
									</Button>
								</div>
							</li>
						);
					})}
				</ul>
			)}

			<div>
				<Button
					type="button"
					onClick={handleConnect}
					disabled={isTokenPending || isMutating}
				>
					{isTokenPending ? "Abrindo…" : "Conectar banco"}
				</Button>
			</div>

			{connectToken && (
				<PluggyConnect
					connectToken={connectToken}
					includeSandbox={includeSandbox}
					onSuccess={handleWidgetSuccess}
					onError={handleWidgetError}
					onClose={() => setConnectToken(null)}
				/>
			)}

			<Dialog
				open={toDisconnect !== null}
				onOpenChange={(isOpen) => {
					if (!isOpen && !isMutating) setToDisconnect(null);
				}}
			>
				<DialogContent
					className="max-w-md"
					onEscapeKeyDown={(e) => {
						if (isMutating) e.preventDefault();
					}}
					onPointerDownOutside={(e) => {
						if (isMutating) e.preventDefault();
					}}
				>
					<DialogHeader>
						<DialogTitle>Desconectar banco?</DialogTitle>
						<DialogDescription>
							A conexão com{" "}
							<strong>
								{toDisconnect?.connectorName || "esta instituição"}
							</strong>{" "}
							será removida e novos lançamentos deixarão de ser importados. Os
							lançamentos já criados na sua Caixa de entrada permanecem.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setToDisconnect(null)}
							disabled={isMutating}
						>
							Cancelar
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={handleDisconnect}
							disabled={isMutating}
						>
							{isMutating ? "Desconectando…" : "Desconectar"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
