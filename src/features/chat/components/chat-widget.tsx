"use client";

import { useState, useRef, useEffect } from "react";
import { X, Send, MessageCircle, Loader2, Paperclip } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const ACCEPTED_EXTENSIONS = ".jpg,.jpeg,.png,.webp,.pdf";
const MAX_FILE_MB = 10;

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

export function ChatWidget() {
	const [open, setOpen] = useState(false);
	const [input, setInput] = useState("");
	const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
	const [loading, setLoading] = useState(false);
	const [file, setFile] = useState<FileAttachment | null>(null);
	const [fileError, setFileError] = useState<string | null>(null);
	const bottomRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages, loading]);

	useEffect(() => {
		if (open) setTimeout(() => inputRef.current?.focus(), 100);
	}, [open]);

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
			previewUrl: isImage ? `data:${selected.type};base64,${base64}` : undefined,
		});

		// Reset input
		if (fileInputRef.current) fileInputRef.current.value = "";
		inputRef.current?.focus();
	}

	async function sendMessage(override?: string) {
		const text = (override ?? input).trim();
		if ((!text && !file) || loading) return;

		const sentFile = file;
		setInput("");
		setFile(null);
		setFileError(null);

		// Adicionar mensagem do usuário na UI
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
						? { data: sentFile.data, mimeType: sentFile.mimeType, name: sentFile.name }
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

	const canSend = !loading && (input.trim().length > 0 || file !== null);

	return (
		<>
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

			{open && (
				<div className="fixed bottom-24 right-3 left-3 z-50 flex flex-col rounded-2xl border border-border bg-background shadow-2xl overflow-hidden sm:left-auto sm:right-6 sm:w-[360px]">
					{/* Header */}
					<div className="flex items-center gap-3 bg-orange-500 px-4 py-3">
						<div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-lg">
							🪙
						</div>
						<div>
							<p className="text-sm font-semibold text-white">Monetinha</p>
							<p className="text-xs text-orange-100">Assistente financeira</p>
						</div>
					</div>

					{/* Mensagens */}
					<div className="h-64 overflow-y-auto px-4 py-3 sm:h-80">
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
									{/* Preview de arquivo */}
									{msg.filePreview && (
										<div className="mb-2">
											{msg.filePreview.type === "image" && msg.filePreview.url ? (
												<img
													src={msg.filePreview.url}
													alt={msg.filePreview.name}
													className="max-h-32 w-full rounded-lg object-cover"
												/>
											) : (
												<div className="flex items-center gap-1.5 rounded-lg bg-white/20 px-2 py-1.5 text-xs">
													<Paperclip size={12} />
													<span className="truncate max-w-[180px]">{msg.filePreview.name}</span>
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
							))}
							<div ref={bottomRef} />
						</div>
					</div>

					{/* Sugestões (só no início) */}
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

					{/* Preview do arquivo selecionado */}
					{file && (
						<div className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2">
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

					{/* Erro de arquivo */}
					{fileError && (
						<p className="mx-3 mb-2 text-xs text-destructive">{fileError}</p>
					)}

					{/* Input */}
					<div className="flex items-end gap-2 border-t border-border px-3 py-3">
						{/* Input de arquivo oculto */}
						<input
							ref={fileInputRef}
							type="file"
							accept={ACCEPTED_EXTENSIONS}
							onChange={handleFileSelect}
							className="hidden"
							aria-label="Anexar arquivo"
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
							placeholder={file ? "Adicione uma mensagem (opcional)..." : "Pergunta pra Monetinha..."}
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
		</>
	);
}