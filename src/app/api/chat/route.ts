import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText, stepCountIs } from "ai";
import { z } from "zod";
import { getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { chatMessages, userPreferences } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { buildChatContext } from "@/features/chat/lib/build-chat-context";
import { executeRegisterTransaction } from "@/features/chat/lib/execute-chat-tool";
import {
  fetchMonthlySummaryForChat,
  fetchTransactionsForChat,
} from "@/features/chat/lib/execute-chat-queries";

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
- Analisar arquivos (imagens e PDFs) para extrair dados financeiros
- Registrar transações diretamente no sistema via ferramenta
- Consultar resumo mensal e listar transações em tempo real via ferramentas

Regras gerais:
- NUNCA invente números ou dados — use apenas o contexto financeiro fornecido ou as ferramentas de consulta
- Se não tiver a informação, use as ferramentas de consulta antes de dizer que não sabe
- Respostas curtas para perguntas simples, detalhadas apenas quando pedido

Sobre análise de arquivos:
- Ao receber imagem ou PDF: extraia nome/estabelecimento, valor, data, tipo (despesa ou receita)
- Se o arquivo chegou SEM mensagem de contexto: pergunte "Recebi o arquivo! Você já pagou/recebeu isso, ou ainda vai pagar/receber?"
- Se o arquivo tiver qualidade ruim ou dados ilegíveis: peça para o usuário digitar os dados manualmente
- Para PDFs quando o modelo atual não suporta: oriente o usuário a trocar para Gemini 3.5 Flash nas configurações

Sobre registro de transações (ferramenta registrar_transacao):
- REGRA ABSOLUTA: SEMPRE pergunte "Em qual conta ou cartão devo registrar?" antes de chamar a ferramenta — sem exceção
- Use os IDs EXATOS listados na seção "Dados para registro de transações" do contexto financeiro
- Antes de registrar, confirme com o usuário: nome, valor, data, tipo, condição e conta/cartão
- Após registro bem-sucedido: comemore e confirme claramente o que foi registrado 🎉
- Em caso de erro da ferramenta: explique de forma clara o que aconteceu

Sobre consulta de dados (ferramentas consultar_resumo_mensal e listar_transacoes):
- Use consultar_resumo_mensal para perguntas sobre totais, saldo ou gastos por categoria
- Use listar_transacoes para perguntas sobre transações específicas ou histórico
- Sempre use as ferramentas antes de dizer que não tem acesso a um dado financeiro`;

const registrarSchema = z.object({
  name: z.string().describe("Nome do estabelecimento ou descrição"),
  amount: z.number().positive().describe("Valor em reais, sempre positivo"),
  transactionType: z
    .enum(["Despesa", "Receita"])
    .describe("Tipo da transação"),
  condition: z
    .enum(["À vista", "Parcelado", "Recorrente"])
    .describe("Condição de pagamento"),
  paymentMethod: z
    .enum([
      "Cartão de crédito",
      "Cartão de débito",
      "Pix",
      "Dinheiro",
      "Boleto",
      "Pré-Pago | VR/VA",
      "Transferência bancária",
    ])
    .describe("Forma de pagamento"),
  purchaseDate: z.string().describe("Data no formato YYYY-MM-DD"),
  accountId: z
    .string()
    .nullable()
    .describe("ID exato da conta (obrigatório exceto Cartão de crédito)"),
  cardId: z
    .string()
    .nullable()
    .describe("ID exato do cartão (obrigatório para Cartão de crédito)"),
  categoryId: z.string().nullable().describe("ID exato da categoria"),
  isSettled: z
    .boolean()
    .describe("true se já foi pago/recebido, false se ainda não"),
  note: z.string().nullable().describe("Observação opcional"),
  installmentCount: z
    .number()
    .int()
    .min(2)
    .max(60)
    .nullable()
    .describe("Número de parcelas (somente se Parcelado)"),
  recurrenceCount: z
    .number()
    .int()
    .min(2)
    .max(60)
    .nullable()
    .describe("Número de meses (somente se Recorrente)"),
});

type FileAttachment = {
  data: string;
  mimeType: string;
  name: string;
} | null;

function buildUserContent(
  file: FileAttachment,
  message: string,
  modelId: string,
) {
  const parts: Array<Record<string, unknown>> = [];
  const isGemini = modelId.startsWith("google/");

  if (file) {
    const isPDF = file.mimeType === "application/pdf";

    if (isPDF && isGemini) {
      parts.push({
        type: "file",
        data: Buffer.from(file.data, "base64"),
        mediaType: "application/pdf",
      });
    } else if (isPDF && !isGemini) {
      parts.push({
        type: "text",
        text: `[O usuário enviou o arquivo PDF "${file.name}". Este modelo não suporta PDFs nativamente. Informe ao usuário que deve usar um modelo Gemini nas configurações do assistente.]`,
      });
    } else {
      parts.push({
        type: "image",
        image: Buffer.from(file.data, "base64"),
        mediaType: file.mimeType,
      });
    }
  }

  if (message.trim()) {
    parts.push({ type: "text", text: message });
  } else if (file) {
    parts.push({ type: "text", text: "(arquivo enviado sem mensagem)" });
  }

  if (parts.length === 1 && parts[0]?.type === "text") {
    return parts[0].text as string;
  }

  return parts;
}

export async function POST(req: Request) {
  const userId = await getUserId();

  const { message, file } = (await req.json()) as {
    message: string;
    file: FileAttachment;
  };

  if (!message?.trim() && !file) {
    return new Response("Mensagem vazia", { status: 400 });
  }

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

  const modelId = prefs?.chatModel ?? "google/gemini-3.5-flash";
  const personalityExtra = prefs?.chatPersonality ?? "";

  const userMessageForDB = file
    ? `[📎 ${file.mimeType === "application/pdf" ? "PDF" : "Imagem"}: ${file.name}]${message?.trim() ? ` ${message}` : ""}`
    : message;

  await db.insert(chatMessages).values({
    userId,
    role: "user",
    content: userMessageForDB,
  });

  const userContent = buildUserContent(file, message ?? "", modelId);

  const result = streamText({
    model: openrouter(modelId),
    system: [SYSTEM_PROMPT, financialContext, personalityExtra]
      .filter(Boolean)
      .join("\n\n"),
    messages: [
      ...history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      {
        role: "user" as const,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        content: userContent as any,
      },
    ],
    tools: {
      registrar_transacao: {
        description:
          "Registra uma transação financeira no sistema. Só chame após confirmar todos os dados com o usuário, especialmente a conta ou cartão.",
        inputSchema: registrarSchema,
        execute: async (input: z.infer<typeof registrarSchema>) => {
          return await executeRegisterTransaction(userId, input);
        },
      },
      consultar_resumo_mensal: {
        description:
          "Consulta o resumo financeiro do usuário em um período: total de receitas, despesas, saldo e breakdown por categoria. Use para responder 'quanto gastei esse mês', 'qual meu saldo', 'como estão meus gastos', 'gastos por categoria'.",
        inputSchema: z.object({
          period: z
            .string()
            .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
            .nullable()
            .describe("Período no formato YYYY-MM. Null = mês atual."),
        }),
        execute: async ({ period }: { period: string | null }) => {
          return await fetchMonthlySummaryForChat(userId, period ?? undefined);
        },
      },
      listar_transacoes: {
        description:
          "Lista as transações do usuário com filtros opcionais de período, categoria e quantidade. Use para responder sobre transações específicas, histórico de gastos ou quando o usuário quer ver lançamentos.",
        inputSchema: z.object({
          period: z
            .string()
            .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
            .nullable()
            .describe("Período YYYY-MM. Null = mês atual."),
          categoryId: z
            .string()
            .uuid()
            .nullable()
            .describe("Filtrar por categoria específica. Null = todas."),
          limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .nullable()
            .describe("Máximo de transações a retornar. Padrão: 20."),
        }),
        execute: async ({
          period,
          categoryId,
          limit,
        }: {
          period: string | null;
          categoryId: string | null;
          limit: number | null;
        }) => {
          return await fetchTransactionsForChat(userId, {
            period: period ?? undefined,
            categoryId: categoryId ?? undefined,
            limit: limit ?? undefined,
          });
        },
      },
    },
    stopWhen: stepCountIs(3),
    onFinish: async ({ text }) => {
      if (text?.trim()) {
        await db.insert(chatMessages).values({
          userId,
          role: "assistant",
          content: text,
        });
      }
    },
  });

  return result.toTextStreamResponse();
}