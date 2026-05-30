import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText } from "ai";
import { getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { chatMessages, userPreferences } from "@/db/schema"; // userPreferences já estava importado separado, unificado aqui
import { eq, asc } from "drizzle-orm";
import { buildChatContext } from "@/features/chat/lib/build-chat-context";

const openrouter = createOpenRouter({
	apiKey: process.env.OPENROUTER_API_KEY,
});

const SYSTEM_PROMPT = `Você é a Monetinha, assistente financeira pessoal do OpenMonetis. 🪙

Sua personalidade:
- Divertida, animada e fala como uma amiga próxima — nunca como um banco ou robô
- Usa emojis com moderação (1-2 por mensagem, nunca exagera)
- Comemora quando o usuário economiza ou bate metas
- É honesta e direta quando os gastos estão altos, mas sempre com carinho
- Usa linguagem informal em português brasileiro
- Respostas objetivas — vai direto ao ponto sem enrolação

Suas capacidades:
- Responder perguntas sobre os dados financeiros do usuário
- Gerar análises e insights detalhados sobre gastos e receitas
- Comparar períodos e identificar tendências
- Dar dicas práticas e personalizadas baseadas nos dados reais
- Ajudar a planejar orçamentos e metas

Regras importantes:
- NUNCA invente números ou dados — use apenas o contexto financeiro fornecido abaixo
- Se não tiver a informação, diga claramente que não tem acesso a esse dado
- Respostas curtas para perguntas simples, detalhadas apenas quando pedido`;

export async function POST(req: Request) {
	const userId = await getUserId();
	const { message } = await req.json();

	if (!message?.trim()) {
		return new Response("Mensagem vazia", { status: 400 });
	}

	// MUDANÇA 1: buscar prefs junto com history e context
	const [history, financialContext, prefs] = await Promise.all([
		db.query.chatMessages.findMany({
			where: eq(chatMessages.userId, userId),
			orderBy: [asc(chatMessages.createdAt)],
			limit: 20,
		}),
		buildChatContext(userId),
		db.query.userPreferences.findFirst({
			where: eq(userPreferences.userId, userId),
		}),
	]);

	// MUDANÇA 1 (cont.): extrair modelo e personalidade das prefs
	const modelId = prefs?.chatModel ?? "google/gemini-2.0-flash-001";
	const personalityExtra = prefs?.chatPersonality ?? "";

	await db.insert(chatMessages).values({
		userId,
		role: "user",
		content: message,
	});

	const result = streamText({
		model: openrouter(modelId), // MUDANÇA 2: era hardcoded "google/gemini-2.0-flash-001"
		system: `${SYSTEM_PROMPT}\n\n${personalityExtra}\n\n${financialContext}`, // MUDANÇA 2: adiciona personalityExtra
		messages: [
			...history.map((m) => ({
				role: m.role as "user" | "assistant",
				content: m.content,
			})),
			{ role: "user", content: message },
		],
		onFinish: async ({ text }) => {
			await db.insert(chatMessages).values({
				userId,
				role: "assistant",
				content: text,
			});
		},
	});

	return result.toTextStreamResponse();
}