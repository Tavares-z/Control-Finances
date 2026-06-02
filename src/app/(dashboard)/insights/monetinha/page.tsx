"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bot, Calendar, Clock } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Separator } from "@/shared/components/ui/separator";

interface InsightData {
	content: string;
	timestamp: number;
}

// Renderizador simples de markdown
function renderLine(line: string, index: number) {
	if (line.startsWith("## ")) {
		return (
			<h2 key={index} className="text-xl font-bold mt-8 mb-3 text-foreground">
				{line.slice(3)}
			</h2>
		);
	}
	if (line.startsWith("### ")) {
		return (
			<h3 key={index} className="text-base font-semibold mt-6 mb-2 text-foreground">
				{line.slice(4)}
			</h3>
		);
	}
	if (line.startsWith("# ")) {
		return (
			<h1 key={index} className="text-2xl font-bold mt-4 mb-4 text-foreground">
				{line.slice(2)}
			</h1>
		);
	}
	if (line.startsWith("- ") || line.startsWith("* ")) {
		return (
			<li key={index} className="ml-5 list-disc mb-1 text-muted-foreground leading-relaxed">
				{renderInline(line.slice(2))}
			</li>
		);
	}
	if (line.trim() === "") {
		return <div key={index} className="h-3" />;
	}
	return (
		<p key={index} className="mb-2 text-muted-foreground leading-relaxed">
			{renderInline(line)}
		</p>
	);
}

function renderInline(text: string): React.ReactNode {
	const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
	return parts.map((part, i) => {
		if (part.startsWith("**") && part.endsWith("**")) {
			return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
		}
		if (part.startsWith("*") && part.endsWith("*")) {
			return <em key={i}>{part.slice(1, -1)}</em>;
		}
		return part;
	});
}

function formatTimestamp(ts: number) {
	const date = new Date(ts);
	return date.toLocaleString("pt-BR", {
		day: "2-digit",
		month: "long",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function getCurrentPeriod() {
	return new Date().toLocaleDateString("pt-BR", {
		month: "long",
		year: "numeric",
	});
}

export default function MonetinhaInsightPage() {
	const router = useRouter();
	const [insight, setInsight] = useState<InsightData | null>(null);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		try {
			const raw = sessionStorage.getItem("monetinha_insight");
			if (raw) {
				setInsight(JSON.parse(raw) as InsightData);
			}
		} catch {
			// sessionStorage indisponível
		}
		setLoaded(true);
	}, []);

	if (!loaded) {
		return (
			<div className="flex h-64 items-center justify-center">
				<div className="h-6 w-6 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
			</div>
		);
	}

	if (!insight) {
		return (
			<div className="mx-auto max-w-3xl px-4 py-12 text-center">
				<div className="mb-4 text-5xl">🪙</div>
				<h2 className="mb-2 text-xl font-semibold">Nenhuma análise disponível</h2>
				<p className="mb-6 text-muted-foreground">
					Converse com a Monetinha e peça uma análise financeira. Assim que ela
					responder, você poderá abrí-la aqui.
				</p>
				<Button onClick={() => router.back()} variant="outline">
					<ArrowLeft className="mr-2 size-4" />
					Voltar
				</Button>
			</div>
		);
	}

	const lines = insight.content.split("\n");

	return (
		<div className="mx-auto max-w-3xl px-4 py-6">
			{/* Header */}
			<div className="mb-6 flex items-center gap-4">
				<Button
					variant="ghost"
					size="sm"
					onClick={() => router.back()}
					className="gap-2 text-muted-foreground hover:text-foreground"
				>
					<ArrowLeft className="size-4" />
					Voltar
				</Button>
			</div>

			{/* Card principal */}
			<div className="rounded-2xl border border-border bg-card shadow-sm">
				{/* Card header */}
				<div className="flex items-start gap-4 rounded-t-2xl bg-gradient-to-r from-orange-500 to-orange-400 p-6">
					<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 text-xl">
						🪙
					</div>
					<div className="flex-1">
						<div className="flex items-center gap-2">
							<Bot className="size-4 text-white/80" />
							<span className="text-sm font-medium text-white/80">Monetinha</span>
						</div>
						<h1 className="mt-0.5 text-xl font-bold text-white">
							Análise Financeira
						</h1>
					</div>
				</div>

				{/* Meta info */}
				<div className="flex flex-wrap items-center gap-4 border-b border-border px-6 py-3 text-xs text-muted-foreground">
					<div className="flex items-center gap-1.5">
						<Calendar className="size-3.5" />
						<span className="capitalize">{getCurrentPeriod()}</span>
					</div>
					<div className="flex items-center gap-1.5">
						<Clock className="size-3.5" />
						<span>Gerado em {formatTimestamp(insight.timestamp)}</span>
					</div>
				</div>

				{/* Conteúdo */}
				<div className="px-6 py-6">
					<div className="space-y-0.5">
						{lines.map((line, i) => renderLine(line, i))}
					</div>
				</div>

				<Separator />

				{/* Footer */}
				<div className="flex items-center justify-between rounded-b-2xl px-6 py-4">
					<p className="text-xs text-muted-foreground">
						Análise gerada pela Monetinha com base nos seus dados financeiros.
					</p>
					<Button
						variant="outline"
						size="sm"
						onClick={() => router.back()}
					>
						<ArrowLeft className="mr-2 size-3.5" />
						Voltar
					</Button>
				</div>
			</div>
		</div>
	);
}