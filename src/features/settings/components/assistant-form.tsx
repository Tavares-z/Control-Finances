"use client";

import { useState, useTransition } from "react";
import { updateChatSettings } from "../actions";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Separator } from "@/shared/components/ui/separator";
import { toast } from "sonner";
import {
	Bot,
	Sparkles,
	Settings2,
	CalendarDays,
	Database,
	Search,
	Shield,
} from "lucide-react";

export const MODELS = [
	{ value: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash" },
	{ value: "google/gemini-2.5-flash-preview-05-20", label: "Gemini 2.5 Flash" },
	{ value: "anthropic/claude-haiku-3-5", label: "Claude 3.5 Haiku" },
	{ value: "openai/gpt-4o-mini", label: "GPT-4o Mini" },
	{ value: "openai/gpt-4o", label: "GPT-4o" },
] as const;

function getCurrentPeriod() {
	const now = new Date();
	return now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

interface AssistantFormProps {
	initialModel?: string;
	initialPersonality?: string;
}

export function AssistantForm({
	initialModel = "google/gemini-2.0-flash-001",
	initialPersonality = "",
}: AssistantFormProps) {
	const [model, setModel] = useState<(typeof MODELS)[number]["value"]>(
		MODELS.find((m) => m.value === initialModel)?.value ??
			"google/gemini-2.0-flash-001",
	);
	const [personality, setPersonality] = useState(initialPersonality);
	const [isPending, startTransition] = useTransition();

	function handleSave() {
		startTransition(async () => {
			const result = await updateChatSettings({
				chatModel: model,
				chatPersonality: personality,
			});

			if (result.success) {
				toast.success("Configurações da Monetinha salvas!");
			} else {
				toast.error(result.error ?? "Erro ao salvar configurações.");
			}
		});
	}

	return (
		<div className="space-y-6">
			{/* Título */}
			<div className="flex items-center gap-2 text-orange-500">
				<Bot className="size-5" />
				<h3 className="font-semibold text-base">Monetinha — Assistente AI</h3>
			</div>

			{/* Modelo */}
			<div className="space-y-2">
				<Label htmlFor="chat-model">Modelo de IA</Label>
				<Select
					value={model}
					onValueChange={(v) =>
						setModel(v as (typeof MODELS)[number]["value"])
					}
				>
					<SelectTrigger id="chat-model" className="w-full sm:w-72">
						<SelectValue placeholder="Selecione o modelo" />
					</SelectTrigger>
					<SelectContent>
						{MODELS.map((m) => (
							<SelectItem key={m.value} value={m.value}>
								{m.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<p className="text-xs text-muted-foreground">
					Modelos mais avançados são mais precisos, mas podem ser mais lentos.
				</p>
			</div>

			{/* Personalidade */}
			<div className="space-y-2">
				<Label htmlFor="chat-personality" className="flex items-center gap-1">
					<Sparkles className="size-3.5" />
					Personalidade customizada
				</Label>
				<Textarea
					id="chat-personality"
					value={personality}
					onChange={(e) => setPersonality(e.target.value)}
					placeholder="Ex: Seja mais formal e técnico. Sempre cite as categorias dos gastos nas respostas."
					className="min-h-28 resize-none"
					maxLength={500}
				/>
				<p className="text-xs text-muted-foreground">
					Instrução extra enviada à Monetinha em toda conversa.{" "}
					<span className="tabular-nums">{personality.length}/500</span>
				</p>
			</div>

			<Button
				onClick={handleSave}
				disabled={isPending}
				className="bg-orange-500 hover:bg-orange-600 text-white"
			>
				{isPending ? "Salvando…" : "Salvar configurações"}
			</Button>

			<Separator />

			{/* Resumo da análise */}
			<div className="space-y-4">
				<div className="flex items-center gap-2">
					<Settings2 className="size-4 text-muted-foreground" />
					<span className="text-sm font-semibold">Resumo da análise</span>
				</div>

				<div className="space-y-4">
					<div className="flex items-start gap-3">
						<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
							<CalendarDays className="size-4 text-muted-foreground" />
						</div>
						<div>
							<p className="text-sm font-medium">Período</p>
							<p className="text-sm text-muted-foreground capitalize">
								{getCurrentPeriod()}
							</p>
						</div>
					</div>

					<div className="flex items-start gap-3">
						<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
							<Database className="size-4 text-muted-foreground" />
						</div>
						<div>
							<p className="text-sm font-medium">Fonte dos dados</p>
							<p className="text-sm text-muted-foreground">
								Transações, categorias, cartões, contas, orçamentos,
								recorrências e parcelamentos do mês.
							</p>
						</div>
					</div>

					<div className="flex items-start gap-3">
						<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
							<Search className="size-4 text-muted-foreground" />
						</div>
						<div>
							<p className="text-sm font-medium">Escopo da análise</p>
							<p className="text-sm text-muted-foreground">
								Busca comportamentos, gatilhos, recomendações e melhorias
								financeiras.
							</p>
						</div>
					</div>

					<div className="flex items-start gap-3">
						<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
							<Shield className="size-4 text-muted-foreground" />
						</div>
						<div>
							<p className="text-sm font-medium">Privacidade dos dados</p>
							<p className="text-sm text-muted-foreground">
								Dados enviados ao provedor externo escolhido. Nenhuma informação
								é armazenada pelo OpenMonetis.
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}