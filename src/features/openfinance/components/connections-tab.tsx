"use client";

import {
	RiBankLine,
	RiCheckboxCircleLine,
	RiErrorWarningLine,
	RiQuestionLine,
} from "@remixicon/react";
import type { OpenFinanceConnectionListItem } from "@/features/openfinance/queries";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { formatDateTime } from "@/shared/utils/date";

interface ConnectionsTabProps {
	connections: OpenFinanceConnectionListItem[];
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

export function ConnectionsTab({ connections }: ConnectionsTabProps) {
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
							</li>
						);
					})}
				</ul>
			)}

			<div className="flex flex-col items-start gap-1">
				<Tooltip>
					<TooltipTrigger asChild>
						{/* span é o alvo de hover: botão desabilitado não emite pointer events */}
						<span>
							<Button type="button" disabled>
								Conectar banco
							</Button>
						</span>
					</TooltipTrigger>
					<TooltipContent>Disponível em breve</TooltipContent>
				</Tooltip>
				<p className="text-xs text-muted-foreground">Disponível em breve.</p>
			</div>
		</div>
	);
}
