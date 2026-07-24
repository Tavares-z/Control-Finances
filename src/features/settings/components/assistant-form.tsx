"use client";

import { useRouter } from "next/navigation";
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
import { Bot, Sparkles, CalendarDays, Database, Search, Shield } from "lucide-react";

export const MODELS = [
	{ value: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash" },
	{ value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
	{ value: "anthropic/claude-3-5-haiku", label: "Claude 3.5 Haiku" },
	{ value: "openai/gpt-4o", label: "GPT-4o" },
] as const;

function getCurrentPeriod() {
	return new Date().toLocaleDateString("pt-BR", {
		month: "long",
		year: "numeric",
	});
}

interface AssistantFormProps {
	initialModel?: string;
	initialPersonality?: string;
}

export function AssistantForm({
	initialModel = "google/gemini-3.5-flash",
	initialPersonality = "",
}: AssistantFormProps) {
	const [model, setModel] = useState<(typeof MODELS)[number]["value"]>(
		MODELS.find((m) => m.value === initialModel)?.value ??
		"google/gemini-3.5-flash",
	);
	const [personality, setPersonality] = useState(initialPersonality);
	const [isPending, startTransition] = useTransition();
	const router = useRouter();

	function handleSave() {
		startTransition(async () => {
			const result = await updateChatSettings({
				chatModel: model,
				chatPersonality: personality,
			});

			if (result.success) {
				toast.success("Configurações da Monetinha salvas!");
				router.refresh();
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
					onValueChange={(v) => setModel(v as (typeof MODELS)[number]["value"])}
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
				<p className="text-xs text-muted-foreground flex items-center gap-1.5">
					<span className="inline-block size-1.5 rounded-full bg-green-500 shrink-0" />
					Prompt padrão ativo. A análise seguirá o formato e as prioridades originais.
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

			{/* Configuração atual */}
			<div className="space-y-3">
				<div>
					<p className="text-sm font-semibold">Configuração atual</p>
					<p className="text-xs text-muted-foreground mt-0.5">
						A análise seguirá o formato e as prioridades originais.
					</p>
				</div>

				<div className="grid gap-2">
					{/* Período */}
					<div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
						<CalendarDays className="size-4 shrink-0 text-muted-foreground" />
						<div className="min-w-0">
							<p className="text-xs text-muted-foreground">Período</p>
							<p className="text-sm font-medium capitalize">{getCurrentPeriod()}</p>
						</div>
					</div>

					{/* Fonte dos dados */}
					<div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
						<Database className="size-4 shrink-0 mt-0.5 text-muted-foreground" />
						<div className="min-w-0">
							<p className="text-xs text-muted-foreground">Fonte dos dados</p>
							<p className="text-sm font-medium leading-snug">
								Transações, categorias, cartões, contas, orçamentos, recorrências e parcelamentos do mês.
							</p>
						</div>
					</div>

					{/* Escopo */}
					<div className="flex items-start gap-3 rounded-xl bg-orange-500/10 border border-orange-500/20 px-4 py-3">
						<Search className="size-4 shrink-0 mt-0.5 text-orange-500" />
						<div className="min-w-0">
							<p className="text-xs text-orange-500/80">Escopo da análise</p>
							<p className="text-sm font-medium text-orange-600 dark:text-orange-400 leading-snug">
								Busca comportamentos, gatilhos, recomendações e melhorias financeiras.
							</p>
						</div>
					</div>

					{/* Privacidade */}
					<div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
						<Shield className="size-4 shrink-0 mt-0.5 text-muted-foreground" />
						<div className="min-w-0">
							<p className="text-xs text-muted-foreground">Privacidade dos dados</p>
							<p className="text-sm font-medium leading-snug">
								Dados enviados ao provedor externo escolhido. Nenhuma informação é armazenada pelo OpenMonetis.
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}