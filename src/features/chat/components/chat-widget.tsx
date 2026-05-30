"use client";

import { useState, useRef, useEffect } from "react";
import { X, Send, MessageCircle, Loader2 } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

interface Message {
	id: string;
	role: "user" | "assistant";
	content: string;
}

const INITIAL_MESSAGES: Message[] = [
	{
		id: "welcome",
		role: "assistant",
		content:
			"Oi! Sou a Monetinha, sua assistente financeira 🪙 Me pergunta qualquer coisa sobre suas finanças!",
	},
];

const SUGGESTIONS = [
	{ emoji: "📊", label: "Resumo do mês" },
	{ emoji: "💸", label: "Maiores gastos" },
	{ emoji: "🎯", label: "Ver orçamentos" },
];

export function ChatWidget() {
	const [open, setOpen] = useState(false);
	const [input, setInput] = useState("");
	const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
	const [loading, setLoading] = useState(false);
	const bottomRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages, loading]);

	useEffect(() => {
		if (open) setTimeout(() => inputRef.current?.focus(), 100);
	}, [open]);

	async function sendMessage(override?: string) {
		const text = (override ?? input).trim();
		if (!text || loading) return;

		setInput("");
		setMessages((prev) => [
			...prev,
			{ id: crypto.randomUUID(), role: "user", content: text },
		]);
		setLoading(true);

		try {
			const res = await fetch("/api/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ message: text }),
			});

			if (!res.ok || !res.body) throw new Error("Erro na resposta");

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let assistantMessage = "";
			const assistantId = crypto.randomUUID();

			setMessages((prev) => [
				...prev,
				{ id: assistantId, role: "assistant", content: "" },
			]);

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				assistantMessage += decoder.decode(value);
				setMessages((prev) =>
					prev.map((m) =>
						m.id === assistantId
							? { ...m, content: assistantMessage }
							: m,
					),
				);
			}
		} catch {
			setMessages((prev) => [
				...prev,
				{
					id: crypto.randomUUID(),
					role: "assistant",
					content: "Ih, deu um erro aqui 😅 Tenta de novo!",
				},
			]);
		} finally {
			setLoading(false);
		}
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}

	return (
		<>
			<button
				onClick={() => setOpen((v) => !v)}
				className={cn(
					"fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-200",
					"bg-orange-500 hover:bg-orange-600 text-white",
					open && "rotate-90",
				)}
				aria-label="Abrir chat da Monetinha"
			>
				{open ? <X size={22} /> : <MessageCircle size={22} />}
			</button>

			{open && (
				<div className="fixed bottom-24 right-6 z-50 flex w-[360px] flex-col rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
					<div className="flex items-center gap-3 bg-orange-500 px-4 py-3">
						<div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-lg">
							🪙
						</div>
						<div>
							<p className="text-sm font-semibold text-white">Monetinha</p>
							<p className="text-xs text-orange-100">Assistente financeira</p>
						</div>
					</div>

					<div className="h-80 overflow-y-auto px-4 py-3">
						<div className="flex flex-col gap-3">
							{messages.map((msg) => (
								<div
									key={msg.id}
									className={cn(
										"max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
										msg.role === "user"
											? "ml-auto bg-orange-500 text-white rounded-br-sm"
											: "mr-auto bg-muted text-foreground rounded-bl-sm",
									)}
								>
									{msg.content || (
										<Loader2
											size={14}
											className="animate-spin text-muted-foreground"
										/>
									)}
								</div>
							))}
							<div ref={bottomRef} />
						</div>
					</div>

					{messages.length === 1 && (
						<div className="flex flex-wrap gap-2 px-4 pb-2">
							{SUGGESTIONS.map((s) => (
								<button
									key={s.label}
									onClick={() => sendMessage(s.label)}
									className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
								>
									{s.emoji} {s.label}
								</button>
							))}
						</div>
					)}

					<div className="flex items-end gap-2 border-t border-border px-3 py-3">
						<textarea
							ref={inputRef}
							value={input}
							onChange={(e) => setInput(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder="Pergunta pra Monetinha..."
							rows={1}
							className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground max-h-24"
						/>
						<button
							onClick={() => sendMessage()}
							disabled={loading || !input.trim()}
							className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50 transition-colors"
						>
							<Send size={14} />
						</button>
					</div>
				</div>
			)}
		</>
	);
}