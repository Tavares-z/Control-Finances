"use client";

import { useState, useRef, useEffect } from "react";
import {
	X,
	Send,
	MessageCircle,
	Loader2,
	Paperclip,
	Maximize2,
	Minimize2,
	ArrowUpRight,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

const ACCEPTED_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"application/pdf",
];
const ACCEPTED_EXTENSIONS = ".jpg,.jpeg,.png,.webp,.pdf";
const MAX_FILE_MB = 10;
const INSIGHT_THRESHOLD = 400;

const VISION_SUPPORTED_MODELS = new Set([
	"google/gemini-3.5-flash",
	"anthropic/claude-3-5-haiku",
	"openai/gpt-4o-mini",
	"openai/gpt-4o",
]);

interface FileAttachment {
	data: string;
	mimeType: string;
	name: string;
	previewUrl?: string;
}

interface Message {
	id: string;
	role: "user" | "assistant";
	content: string;
	filePreview?: {
		type: "image" | "pdf";
		name: string;
		url?: string;
	} | null;
}

const INITIAL_MESSAGES: Message[] = [
	{
		id: "welcome",
		role: "assistant",
		content:
			"Oi! Sou a Monetinha, sua assistente financeira 🪙 Me pergunta qualquer coisa sobre suas finanças ou me manda um comprovante pra registrar!",
	},
];

const SUGGESTIONS = [
	{ emoji: "📊", label: "Resumo do mês" },
	{ emoji: "💸", label: "Maiores gastos" },
	{ emoji: "🎯", label: "Ver orçamentos" },
];

interface ChatWidgetProps {
	currentModel?: string;
}

export function ChatWidget({ currentModel }: ChatWidgetProps) {
	const [open, setOpen] = useState(false);
	const [expanded, setExpanded] = useState(false);
	const [input, setInput] = useState("");
	const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
	const [loading, setLoading] = useState(false);
	const [file, setFile] = useState<FileAttachment | null>(null);
	const [fileError, setFileError] = useState<string | null>(null);
	const [insightContent, setInsightContent] = useState<string | null>(null);
	const bottomRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const modelSupportsVision = VISION_SUPPORTED_MODELS.has(currentModel ?? "");

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages, loading]);

	useEffect(() => {
		if (open) setTimeout(() => inputRef.current?.focus(), 100);
	}, [open]);

	useEffect(() => {
		const handleEsc = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				if (insightContent) {
					setInsightContent(null);
				} else {
					setExpanded(false);
				}
			}
		};
		window.addEventListener("keydown", handleEsc);
		return () => window.removeEventListener("keydown", handleEsc);
	}, [insightContent]);

	function fileToBase64(f: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				const result = reader.result as string;
				resolve(result.split(",")[1] ?? "");
			};
			reader.onerror = reject;
			reader.readAsDataURL(f);
		});
	}

	async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
		setFileError(null);
		const selected = e.target.files?.[0];
		if (!selected) return;

		if (!ACCEPTED_MIME_TYPES.includes(selected.type)) {
			setFileError("Tipo não suportado. Use JPG, PNG, WEBP ou PDF.");
			return;
		}
		if (selected.size > MAX_FILE_MB * 1024 * 1024) {
			setFileError(`Arquivo muito grande. Máximo ${MAX_FILE_MB}MB.`);
			return;
		}

		const base64 = await fileToBase64(selected);
		const isImage = selected.type.startsWith("image/");
		setFile({
			data: base64,
			mimeType: selected.type,
			name: selected.name,
			previewUrl: isImage
				? `data:${selected.type};base64,${base64}`
				: undefined,
		});

		if (fileInputRef.current) fileInputRef.current.value = "";
		inputRef.current?.focus();
	}

	function openInsightModal(content: string) {
		setInsightContent(content);
	}

	async function sendMessage(override?: string) {
		const text = (override ?? input).trim();
		if ((!text && !file) || loading) return;

		const sentFile = file;
		setInput("");
		setFile(null);
		setFileError(null);

		setMessages((prev) => [
			...prev,
			{
				id: crypto.randomUUID(),
				role: "user",
				content: text || "",
				filePreview: sentFile
					? {
							type: sentFile.mimeType === "application/pdf" ? "pdf" : "image",
							name: sentFile.name,
							url: sentFile.previewUrl,
						}
					: null,
			},
		]);
		setLoading(true);

		try {
			const res = await fetch("/api/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					message: text,
					file: sentFile
						? {
								data: sentFile.data,
								mimeType: sentFile.mimeType,
								name: sentFile.name,
							}
						: null,
				}),
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
						m.id === assistantId ? { ...m, content: assistantMessage } : m,
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

	function handleClose() {
		setOpen(false);
		setExpanded(false);
	}

	const canSend =
		!loading &&
		(input.trim().length > 0 || file !== null) &&
		!(!modelSupportsVision && file !== null);

	function renderInline(text: string) {
		const parts = text.split(/(\*\*[^*]+\*\*)/);
		return parts.map((part, i) =>
			part.startsWith("**") ? (
				<strong key={i}>{part.slice(2, -2)}</strong>
			) : (
				part
			),
		);
	}

	function renderMarkdown(content: string) {
		return content.split("\n").map((line, i) => {
			if (line.startsWith("## "))
				return (
					<h2 key={i} className="text-lg font-bold mt-4 mb-2">
						{line.slice(3)}
					</h2>
				);
			if (line.startsWith("### "))
				return (
					<h3 key={i} className="text-base font-semibold mt-3 mb-1">
						{line.slice(4)}
					</h3>
				);
			if (line.startsWith("- "))
				return (
					<li key={i} className="ml-4 text-sm leading-relaxed">
						{renderInline(line.slice(2))}
					</li>
				);
			if (line.trim() === "") return <div key={i} className="h-2" />;
			return (
				<p key={i} className="text-sm leading-relaxed">
					{renderInline(line)}
				</p>
			);
		});
	}

	return (
		<>
			{/* Botão flutuante */}
			{!expanded && (
				<button
					onClick={() => setOpen((v) => !v)}
					className={cn(
						"fixed bottom-6 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-200 sm:right-6",
						"bg-orange-500 hover:bg-orange-600 text-white",
						open && "rotate-90",
					)}
					aria-label="Abrir chat da Monetinha"
				>
					{open ? <X size={22} /> : <MessageCircle size={22} />}
				</button>
			)}

			{/* Backdrop escuro (modo expandido) */}
			{open && expanded && (
				<div
					className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
					onClick={() => setExpanded(false)}
				/>
			)}

			{/* Painel do chat */}
			{open && (
				<div
					className={cn(
						"fixed z-50 flex flex-col border border-border bg-background shadow-2xl overflow-hidden transition-all duration-300",
						expanded
							? "inset-4 rounded-2xl sm:inset-8 md:inset-12"
							: "bottom-24 right-3 left-3 rounded-2xl sm:left-auto sm:right-6 sm:w-[360px]",
					)}
				>
					{/* Header */}
					<div className="flex items-center gap-3 bg-orange-500 px-4 py-3 shrink-0">
						<div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-lg">
							🪙
						</div>
						<div className="flex-1">
							<p className="text-sm font-semibold text-white">Monetinha</p>
							<p className="text-xs text-orange-100">Assistente financeira</p>
						</div>
						<button
							onClick={() => setExpanded((v) => !v)}
							className="flex h-7 w-7 items-center justify-center rounded-full text-white/80 hover:bg-white/20 transition-colors"
							aria-label={expanded ? "Minimizar" : "Expandir"}
						>
							{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
						</button>
						<button
							onClick={handleClose}
							className="flex h-7 w-7 items-center justify-center rounded-full text-white/80 hover:bg-white/20 transition-colors"
							aria-label="Fechar"
						>
							<X size={15} />
						</button>
					</div>

					{/* Mensagens */}
					<div
						className={cn(
							"overflow-y-auto px-4 py-3",
							expanded ? "flex-1 px-6" : "h-64 sm:h-80",
						)}
					>
						<div
							className={cn(
								"flex flex-col gap-3",
								expanded && "max-w-3xl mx-auto w-full",
							)}
						>
							{messages.map((msg) => (
								<div
									key={msg.id}
									className={cn(
										"flex flex-col",
										msg.role === "user" ? "items-end" : "items-start",
									)}
								>
									<div
										className={cn(
											"max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
											msg.role === "user"
												? "bg-orange-500 text-white rounded-br-sm"
												: "bg-muted text-foreground rounded-bl-sm",
										)}
									>
										{/* Preview de arquivo */}
										{msg.filePreview && (
											<div className="mb-2">
												{msg.filePreview.type === "image" &&
												msg.filePreview.url ? (
													<img
														src={msg.filePreview.url}
														alt={msg.filePreview.name}
														className="max-h-40 w-full rounded-lg object-cover"
													/>
												) : (
													<div className="flex items-center gap-1.5 rounded-lg bg-white/20 px-2 py-1.5 text-xs">
														<Paperclip size={12} />
														<span className="truncate max-w-[200px]">
															{msg.filePreview.name}
														</span>
													</div>
												)}
											</div>
										)}

										{msg.content || (
											<Loader2
												size={14}
												className="animate-spin text-muted-foreground"
											/>
										)}
									</div>

									{/* Card "Ver análise completa" em respostas longas */}
									{msg.role === "assistant" &&
										msg.content.length > INSIGHT_THRESHOLD && (
											<button
												onClick={() => openInsightModal(msg.content)}
												className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:border-orange-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/20 transition-all max-w-[85%] text-left"
											>
												<span className="text-base">📊</span>
												<span className="flex-1 font-medium">
													Ver análise completa
												</span>
												<ArrowUpRight size={13} className="shrink-0" />
											</button>
										)}
								</div>
							))}
							<div ref={bottomRef} />
						</div>
					</div>

					{/* Sugestões */}
					{messages.length === 1 && (
						<div
							className={cn(
								"flex flex-wrap gap-2 px-4 pb-2 shrink-0",
								expanded && "max-w-3xl mx-auto w-full px-6",
							)}
						>
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

					{/* Preview arquivo selecionado */}
					{file && (
						<div
							className={cn(
								"mx-3 mb-2 flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2 shrink-0",
								expanded && "mx-6",
							)}
						>
							{file.previewUrl ? (
								<img
									src={file.previewUrl}
									alt={file.name}
									className="h-10 w-10 rounded-lg object-cover shrink-0"
								/>
							) : (
								<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-500">
									<Paperclip size={16} />
								</div>
							)}
							<span className="flex-1 truncate text-xs text-muted-foreground">
								{file.name}
							</span>
							<button
								onClick={() => setFile(null)}
								className="shrink-0 rounded-full p-0.5 hover:bg-muted transition-colors"
								aria-label="Remover arquivo"
							>
								<X size={14} className="text-muted-foreground" />
							</button>
						</div>
					)}

					{!modelSupportsVision && file && (
						<p
							className={cn(
								"mx-3 mb-2 text-xs text-destructive shrink-0",
								expanded && "mx-6",
							)}
						>
							O modelo atual não suporta arquivos. Troque o modelo nas{" "}
							<a
								href="/settings"
								className="underline underline-offset-2 hover:text-destructive/80"
							>
								configurações
							</a>
							.
						</p>
					)}

					{fileError && (
						<p
							className={cn(
								"mx-3 mb-2 text-xs text-destructive shrink-0",
								expanded && "mx-6",
							)}
						>
							{fileError}
						</p>
					)}

					{/* Input */}
					<div
						className={cn(
							"flex items-end gap-2 border-t border-border px-3 py-3 shrink-0",
							expanded && "px-6 py-4 max-w-3xl mx-auto w-full",
						)}
					>
						<input
							ref={fileInputRef}
							type="file"
							accept={ACCEPTED_EXTENSIONS}
							onChange={handleFileSelect}
							className="hidden"
						/>
						<button
							onClick={() => fileInputRef.current?.click()}
							disabled={loading}
							className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
							aria-label="Anexar arquivo"
						>
							<Paperclip size={16} />
						</button>

						<textarea
							ref={inputRef}
							value={input}
							onChange={(e) => setInput(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder={
								file
									? "Adicione uma mensagem (opcional)..."
									: "Pergunta pra Monetinha..."
							}
							rows={1}
							className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground max-h-24"
						/>
						<button
							onClick={() => sendMessage()}
							disabled={!canSend}
							className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50 transition-colors"
						>
							<Send size={14} />
						</button>
					</div>
				</div>
			)}

			{/* Modal de insight */}
			{insightContent && (
				<>
					<div
						className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm"
						onClick={() => setInsightContent(null)}
					/>
					<div className="fixed inset-4 sm:inset-8 md:inset-12 z-[61] flex flex-col rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
						<div className="flex items-center gap-3 bg-orange-500 px-4 py-3 shrink-0">
							<div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-lg">
								🪙
							</div>
							<div className="flex-1">
								<p className="text-sm font-semibold text-white">
									Análise da Monetinha
								</p>
								<p className="text-xs text-orange-100">Assistente financeira</p>
							</div>
							<button
								onClick={() => setInsightContent(null)}
								className="flex h-7 w-7 items-center justify-center rounded-full text-white/80 hover:bg-white/20 transition-colors"
								aria-label="Fechar análise"
							>
								<X size={15} />
							</button>
						</div>
						<div className="flex-1 overflow-y-auto px-6 py-4">
							<div className="max-w-3xl mx-auto">
								{renderMarkdown(insightContent)}
							</div>
						</div>
					</div>
				</>
			)}
		</>
	);
}