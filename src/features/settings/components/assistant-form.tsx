"use client";

import { useState } from "react";
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
import { toast } from "sonner";
import { Bot, Sparkles } from "lucide-react";

const MODELS = [
	{ value: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash" },
	{ value: "google/gemini-2.5-flash-preview-05-20", label: "Gemini 2.5 Flash" },
	{ value: "anthropic/claude-haiku-3-5", label: "Claude 3.5 Haiku" },
	{ value: "openai/gpt-4o-mini", label: "GPT-4o Mini" },
	{ value: "openai/gpt-4o", label: "GPT-4o" },
] as const;

interface AssistantFormProps {
	initialModel?: string;
	initialPersonality?: string;
}

export function AssistantForm({
	initialModel = "google/gemini-2.0-flash-001",
	initialPersonality = "",
}: AssistantFormProps) {
	const [model, setModel] = useState(initialModel);
	const [personality, setPersonality] = useState(initialPersonality);
	const [loading, setLoading] = useState(false);

	async function handleSave() {
		setLoading(true);
		try {
			const result = await updateChatSettings({
				chatModel: model,
				chatPersonality: personality,
			});

			if (result.success) {
				toast.success("Configurações da Monetinha salvas!");
			} else {
				toast.error(result.error ?? "Erro ao salvar configurações.");
			}
		} catch {
			toast.error("Erro inesperado ao salvar.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-2 text-orange-500">
				<Bot className="size-5" />
				<h3 className="font-semibold text-base">Monetinha — Assistente AI</h3>
			</div>

			{/* Modelo */}
			<div className="space-y-2">
				<Label htmlFor="chat-model">Modelo de IA</Label>
				<Select value={model} onValueChange={setModel}>
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
				disabled={loading}
				className="bg-orange-500 hover:bg-orange-600 text-white"
			>
				{loading ? "Salvando…" : "Salvar configurações"}
			</Button>
		</div>
	);
}