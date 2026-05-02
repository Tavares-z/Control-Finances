"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { cards, categories, transactions } from "@/db/schema";
import {
	buildRefundNote,
	isRefundNote,
} from "@/shared/lib/accounts/constants";
import { getUser } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { PERIOD_FORMAT_REGEX } from "@/shared/lib/invoices";
import type { ActionResult } from "@/shared/lib/types/actions";
import { formatDecimalForDbRequired } from "@/shared/utils/currency";
import { parseLocalDateString } from "@/shared/utils/date";
import {
	formatPaidInvoicePeriods,
	getPaidInvoicePeriods,
	revalidate,
} from "./core";

const refundSchema = z.object({
	originalTransactionId: z
		.string({ message: "Lançamento inválido." })
		.uuid("Lançamento inválido."),
	refundDate: z
		.string({ message: "Data inválida." })
		.refine(
			(value) => !Number.isNaN(parseLocalDateString(value).getTime()),
			"Data inválida.",
		),
	refundPeriod: z
		.string({ message: "Período inválido." })
		.regex(PERIOD_FORMAT_REGEX, "Período inválido."),
});

type RefundInput = z.infer<typeof refundSchema>;

export async function refundTransactionAction(
	input: RefundInput,
): Promise<ActionResult<{ refundId: string }>> {
	try {
		const user = await getUser();
		const data = refundSchema.parse(input);

		const original = await db.query.transactions.findFirst({
			where: and(
				eq(transactions.id, data.originalTransactionId),
				eq(transactions.userId, user.id),
			),
		});

		if (!original) {
			return { success: false, error: "Lançamento não encontrado." };
		}

		if (original.transactionType !== "Despesa") {
			return {
				success: false,
				error: "Apenas despesas podem ser estornadas.",
			};
		}

		if (original.condition !== "À vista") {
			return {
				success: false,
				error: "Apenas lançamentos à vista podem ser estornados.",
			};
		}

		if (original.splitGroupId) {
			return {
				success: false,
				error: "Lançamentos divididos não podem ser estornados.",
			};
		}

		if (isRefundNote(original.note)) {
			return {
				success: false,
				error: "Este lançamento já é um reembolso.",
			};
		}

		const [existingRefund, card, paidPeriods, refundCategory] =
			await Promise.all([
				db.query.transactions.findFirst({
					columns: { id: true },
					where: and(
						eq(transactions.userId, user.id),
						eq(transactions.note, buildRefundNote(original.id)),
					),
				}),
				original.cardId
					? db.query.cards.findFirst({
							columns: { id: true },
							where: and(
								eq(cards.id, original.cardId),
								eq(cards.userId, user.id),
							),
						})
					: Promise.resolve(null),
				original.cardId
					? getPaidInvoicePeriods(user.id, original.cardId, [data.refundPeriod])
					: Promise.resolve([] as string[]),
				db.query.categories.findFirst({
					columns: { id: true },
					where: and(
						eq(categories.userId, user.id),
						eq(categories.name, "Reembolso"),
					),
				}),
			]);

		if (existingRefund) {
			return {
				success: false,
				error: "Este lançamento já foi estornado.",
			};
		}

		if (original.cardId && !card) {
			return { success: false, error: "Cartão não encontrado." };
		}

		if (paidPeriods.length > 0) {
			return {
				success: false,
				error: `A fatura de ${formatPaidInvoicePeriods(
					paidPeriods,
				)} já está paga. Desfaça o pagamento antes de lançar o reembolso.`,
			};
		}

		const amountAbs = Math.abs(Number(original.amount));
		const refundDate = parseLocalDateString(data.refundDate);

		const [inserted] = await db
			.insert(transactions)
			.values({
				name: `Reembolso de: ${original.name}`,
				condition: "À vista",
				paymentMethod: original.paymentMethod,
				note: buildRefundNote(original.id),
				amount: formatDecimalForDbRequired(amountAbs),
				purchaseDate: refundDate,
				transactionType: "Receita",
				period: data.refundPeriod,
				isSettled: false,
				userId: user.id,
				cardId: original.cardId,
				accountId: original.accountId,
				categoryId: refundCategory?.id ?? null,
				payerId: original.payerId,
			})
			.returning({ id: transactions.id });

		revalidate(user.id);

		return {
			success: true,
			message: "Reembolso registrado.",
			data: { refundId: inserted?.id ?? "" },
		};
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false,
				error: error.issues[0]?.message ?? "Dados inválidos.",
			};
		}

		return {
			success: false,
			error: error instanceof Error ? error.message : "Erro inesperado.",
		};
	}
}
