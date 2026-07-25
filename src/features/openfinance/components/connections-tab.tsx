"use client";

import {
	RiBankLine,
	RiCheckboxCircleLine,
	RiErrorWarningLine,
	RiQuestionLine,
} from "@remixicon/react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	createConnectTokenAction,
	disconnectConnectionAction,
	registerConnectionAction,
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
import { formatDateTime } from "@/shared/utils/date";

// Widget browser-only: carregado via dynamic ssr:false para não rodar no SSR
// do App Router (o pluggy-connect-sdk depende de APIs de janela).
const PluggyConnect = dynamic(
	() => import("react-pluggy-connect").then((m) => m.PluggyConnect),
	{ ssr: false },
);

interface ConnectionsTabProps {
	connections: OpenFinanceConnectionListItem[];
	/** Habilita conectores sandbox no widget (staging). Prod: false por padrão. */
	includeSandbox: boolean;
}

type BadgeVariant = "success" | "destructive" | "secondary";

function getStatusBadge(status: string | null): {
	variant: BadgeVariant;
	label: string;
	Icon: typeof RiCheckboxCircleLine;
} {
	switch (status) {
		case "UPDATED":
			return {
				variant: "success",
				label: "Atualizada",
				Icon: RiCheckboxCircleLine,
			};
		case "LOGIN_ERROR":
			return {
				variant: "destructive",
				label: "Erro de login",
				Icon: RiErrorWarningLine,
			};
		default:
			return {
				variant: "secondary",
				label: "Desconhecido",
				Icon: RiQuestionLine,
			};
	}
}

export function ConnectionsTab({
	connections,
	includeSandbox,
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
						const status = getStatusBadge(connection.status);
						const lastSync = formatDateTime(connection.lastSyncedAt);
						const consentDate = formatDateTime(connection.consentExpiresAt, {
							day: "2-digit",
							month: "2-digit",
							year: "numeric",
						});

						return (
							<li
								key={connection.id}
								className="rounded-lg border border-border bg-card p-4"
							>
								<div className="flex items-start justify-between gap-3">
									<div className="flex items-center gap-2">
										<RiBankLine
											className="size-5 shrink-0 text-muted-foreground"
											aria-hidden="true"
										/>
										<span className="font-medium">
											{connection.connectorName || "Instituição"}
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
									{connection.accountName && (
										<p>Conta vinculada: {connection.accountName}</p>
									)}
									{consentDate && <p>Consentimento expira em {consentDate}</p>}
								</div>

								<div className="mt-3 flex justify-end">
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
