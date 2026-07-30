import { getUserId } from "@/shared/lib/auth/server";

// Transcrição de áudio (voz → texto) para o registro de gasto falado na
// Monetinha. O áudio NÃO vai para o modelo de chat: é transcrito aqui via o
// endpoint de transcrição do OpenRouter (Whisper) e o texto volta para o input,
// onde o usuário revisa antes de enviar. Isso preserva o modelo default do chat
// (Gemini Flash) e todas as tools — o registro de transação segue idêntico ao
// texto digitado. Reusa a OPENROUTER_API_KEY (mesma credencial do chat), sem
// exigir uma chave de provedor separada.

const OPENROUTER_TRANSCRIBE_ENDPOINT =
	"https://openrouter.ai/api/v1/audio/transcriptions";
const TRANSCRIBE_MODEL = "openai/whisper-1";
const MAX_AUDIO_MB = 20;
// Formatos que o MediaRecorder produz nos navegadores (Chrome/FF: webm,
// Safari/iOS: mp4/m4a) e que o endpoint aceita.
const FORMAT_BY_MIME: Record<string, string> = {
	"audio/webm": "webm",
	"audio/mp4": "m4a",
	"audio/mpeg": "mp3",
	"audio/ogg": "ogg",
	"audio/wav": "wav",
};

function resolveFormat(mimeType: string): string | null {
	const base = mimeType.split(";")[0]?.trim() ?? "";
	return FORMAT_BY_MIME[base] ?? null;
}

export async function POST(req: Request) {
	await getUserId();

	const apiKey = process.env.OPENROUTER_API_KEY;
	if (!apiKey) {
		return Response.json(
			{
				error: "Transcrição indisponível: OPENROUTER_API_KEY não configurada.",
			},
			{ status: 503 },
		);
	}

	const body = (await req.json().catch(() => null)) as {
		data?: string;
		mimeType?: string;
	} | null;

	if (!body?.data || !body.mimeType) {
		return Response.json({ error: "Áudio ausente." }, { status: 400 });
	}

	const format = resolveFormat(body.mimeType);
	if (!format) {
		return Response.json(
			{ error: "Formato de áudio não suportado." },
			{ status: 400 },
		);
	}

	// base64 sem cabeçalho data: — cada char base64 ≈ 0.75 byte.
	const approxBytes = (body.data.length * 3) / 4;
	if (approxBytes > MAX_AUDIO_MB * 1024 * 1024) {
		return Response.json(
			{ error: `Áudio muito grande. Máximo ${MAX_AUDIO_MB}MB.` },
			{ status: 400 },
		);
	}

	try {
		const res = await fetch(OPENROUTER_TRANSCRIBE_ENDPOINT, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: TRANSCRIBE_MODEL,
				input_audio: { data: body.data, format },
				language: "pt",
			}),
		});

		if (!res.ok) {
			// Não repassar o corpo cru do provedor (pode vazar detalhe de conta/chave).
			console.error("OpenRouter transcription failed:", res.status);
			return Response.json(
				{ error: "Não consegui transcrever o áudio. Tenta de novo." },
				{ status: 502 },
			);
		}

		const data = (await res.json()) as { text?: string };
		const text = data.text?.trim() ?? "";

		return Response.json({ text });
	} catch (err) {
		console.error("OpenRouter transcription error:", err);
		return Response.json(
			{ error: "Não consegui transcrever o áudio. Tenta de novo." },
			{ status: 502 },
		);
	}
}
