"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
	cards,
	categories,
	financialAccounts,
	invoices,
	transactions,
} from "@/db/schema";
import {
	buildInvoicePaymentNote,
	INVOICE_ADJUSTMENT_NAME,
} from "@/shared/lib/accounts/constants";
import { revalidateForEntity } from "@/shared/lib/actions/helpers";
import { getUser } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import {
	INVOICE_PAYMENT_STATUS,
	INVOICE_STATUS_VALUES,
	type InvoicePaymentStatus,
	PERIOD_FORMAT_REGEX,
} from "@/shared/lib/invoices";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import {
	formatCurrency,
	formatDecimalForDbRequired,
} from "@/shared/utils/currency";
import {
	getBusinessTodayDate,
	parseLocalDateString,
} from "@/shared/utils/date";

const isValidPaymentDate = (value: string) =>
	!Number.isNaN(parseLocalDateString(value).getTime());

const updateInvoicePaymentStatusSchema = z.object({
	cardId: z.string({ message: "Cartão inválido." }).uuid("Cartão inválido."),
	period: z
		.string({ message: "Período inválido." })
		.regex(PERIOD_FORMAT_REGEX, "Período inválido."),
	status: z.enum(
		INVOICE_STATUS_VALUES as [InvoicePaymentStatus, ...InvoicePaymentStatus[]],
	),
	paymentDate: z
		.string()
		.optional()
		.refine((value) => !value || isValidPaymentDate(value), {
			message: "Data de pagamento inválida.",
		}),
	paymentAccountId: z
		.string({ message: "Conta inválida." })
		.uuid("Conta inválida.")
		.nullable()
		.optional(),
});

type UpdateInvoicePaymentStatusInput = z.infer<
	typeof updateInvoicePaymentStatusSchema
>;

type ActionResult =
	| { success: true; message: string }
	| { success: false; error: string };

const successMessageByStatus: Record<InvoicePaymentStatus, string> = {
	[INVOICE_PAYMENT_STATUS.PAID]: "Fatura marcada como paga.",
	[INVOICE_PAYMENT_STATUS.PENDING]: "Pagamento da fatura foi revertido.",
};

export async function updateInvoicePaymentStatusAction(
	input: UpdateInvoicePaymentStatusInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = updateInvoicePaymentStatusSchema.parse(input);
		const adminPayerId = await getAdminPayerId(user.id);

		await db.transaction(async (tx: typeof db) => {
			const card = await tx.query.cards.findFirst({
				columns: { id: true, accountId: true, name: true },
				where: and(eq(cards.id, data.cardId), eq(cards.userId, user.id)),
			});

			if (!card) {
				throw new Error("Cartão não encontrado.");
			}

			await tx
				.insert(invoices)
				.values({
					cardId: data.cardId,
					period: data.period,
					paymentStatus: data.status,
					userId: user.id,
				})
				.onConflictDoUpdate({
					target: [invoices.userId, invoices.cardId, invoices.period],
					set: {
						paymentStatus: data.status,
					},
				});

			const shouldMarkAsPaid = data.status === INVOICE_PAYMENT_STATUS.PAID;

			await tx
				.update(transactions)
				.set({ isSettled: shouldMarkAsPaid })
				.where(
					and(
						eq(transactions.userId, user.id),
						eq(transactions.cardId, card.id),
						eq(transactions.period, data.period),
					),
				);

			const invoiceNote = buildInvoicePaymentNote(card.id, data.period);

			if (shouldMarkAsPaid) {
				const [adminShareRow] = adminPayerId
					? await tx
							.select({
								total: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
							})
							.from(transactions)
							.where(
								and(
									eq(transactions.userId, user.id),
									eq(transactions.cardId, card.id),
									eq(transactions.period, data.period),
									eq(transactions.payerId, adminPayerId),
									// Valor a pagar = só COMPRAS (despesas). Sem este filtro,
									// os créditos que o Open Finance traz (pagamento/estorno,
									// amount positivo) abateriam o adminShare e o Math.min
									// calcularia um valor a pagar MENOR que o devido. Ver a
									// decisão registrada em cards/queries.ts.
									eq(transactions.transactionType, "Despesa"),
								),
							)
					: [{ total: 0 }];

				const adminShare = Number(adminShareRow?.total ?? 0);
				const adminPayableAmount = Math.abs(Math.min(adminShare, 0));
				const paymentAccountId = data.paymentAccountId ?? card.accountId;

				if (adminPayerId) {
					if (!paymentAccountId) {
						throw new Error("Selecione uma conta para pagar a fatura.");
					}

					const paymentAccount = await tx.query.financialAccounts.findFirst({
						columns: { id: true },
						where: and(
							eq(financialAccounts.id, paymentAccountId),
							eq(financialAccounts.userId, user.id),
						),
					});

					if (!paymentAccount) {
						throw new Error("Conta de pagamento não encontrada.");
					}

					const paymentCategory = await tx.query.categories.findFirst({
						columns: { id: true },
						where: and(
							eq(categories.userId, user.id),
							eq(categories.name, "Pagamentos"),
						),
					});

					const invoiceDate = data.paymentDate
						? parseLocalDateString(data.paymentDate)
						: getBusinessTodayDate();

					const amount = `-${formatDecimalForDbRequired(adminPayableAmount)}`;
					const payload = {
						condition: "À vista",
						name: `Pagamento fatura - ${card.name}`,
						paymentMethod: "Pix",
						note: invoiceNote,
						amount,
						purchaseDate: invoiceDate,
						transactionType: "Despesa" as const,
						period: data.period,
						isSettled: true,
						userId: user.id,
						accountId: paymentAccountId,
						categoryId: paymentCategory?.id ?? null,
						payerId: adminPayerId,
					};

					const existingPayment = await tx.query.transactions.findFirst({
						columns: { id: true },
						where: and(
							eq(transactions.userId, user.id),
							eq(transactions.note, invoiceNote),
						),
					});

					if (existingPayment) {
						await tx
							.update(transactions)
							.set(payload)
							.where(eq(transactions.id, existingPayment.id));
					} else {
						await tx.insert(transactions).values(payload);
					}
				}
			} else {
				await tx
					.delete(transactions)
					.where(
						and(
							eq(transactions.userId, user.id),
							eq(transactions.note, invoiceNote),
						),
					);
			}
		});

		revalidateForEntity("cards", user.id);

		return { success: true, message: successMessageByStatus[data.status] };
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

const updatePaymentDateSchema = z.object({
	cardId: z.string({ message: "Cartão inválido." }).uuid("Cartão inválido."),
	period: z
		.string({ message: "Período inválido." })
		.regex(PERIOD_FORMAT_REGEX, "Período inválido."),
	paymentDate: z
		.string({ message: "Data de pagamento inválida." })
		.refine((value) => isValidPaymentDate(value), {
			message: "Data de pagamento inválida.",
		}),
});

type UpdatePaymentDateInput = z.infer<typeof updatePaymentDateSchema>;

export async function updatePaymentDateAction(
	input: UpdatePaymentDateInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = updatePaymentDateSchema.parse(input);

		await db.transaction(async (tx: typeof db) => {
			const card = await tx.query.cards.findFirst({
				columns: { id: true },
				where: and(eq(cards.id, data.cardId), eq(cards.userId, user.id)),
			});

			if (!card) {
				throw new Error("Cartão não encontrado.");
			}

			const invoiceNote = buildInvoicePaymentNote(card.id, data.period);

			const existingPayment = await tx.query.transactions.findFirst({
				columns: { id: true },
				where: and(
					eq(transactions.userId, user.id),
					eq(transactions.note, invoiceNote),
				),
			});

			if (!existingPayment) {
				throw new Error("Pagamento não encontrado.");
			}

			await tx
				.update(transactions)
				.set({
					purchaseDate: parseLocalDateString(data.paymentDate),
				})
				.where(eq(transactions.id, existingPayment.id));
		});

		revalidateForEntity("cards", user.id);

		return { success: true, message: "Data de pagamento atualizada." };
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

const adjustInvoiceSchema = z.object({
	cardId: z.string({ message: "Cartão inválido." }).uuid("Cartão inválido."),
	period: z
		.string({ message: "Período inválido." })
		.regex(PERIOD_FORMAT_REGEX, "Período inválido."),
	currentTotal: z.number({ message: "Total atual inválido." }),
	targetAmount: z
		.number({ message: "Valor inválido." })
		.nonnegative("O valor deve ser positivo."),
});

type AdjustInvoiceInput = z.infer<typeof adjustInvoiceSchema>;

export async function adjustInvoiceAction(
	input: AdjustInvoiceInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = adjustInvoiceSchema.parse(input);
		const adminPayerId = await getAdminPayerId(user.id);

		let message = "Ajuste de fatura registrado.";

		await db.transaction(async (tx: typeof db) => {
			const card = await tx.query.cards.findFirst({
				columns: { id: true },
				where: and(eq(cards.id, data.cardId), eq(cards.userId, user.id)),
			});

			if (!card) {
				throw new Error("Cartão não encontrado.");
			}

			const existing = await tx.query.transactions.findFirst({
				columns: { id: true, amount: true },
				where: and(
					eq(transactions.userId, user.id),
					eq(transactions.cardId, data.cardId),
					eq(transactions.period, data.period),
					eq(transactions.name, INVOICE_ADJUSTMENT_NAME),
				),
			});

			const existingAmount = Number(existing?.amount ?? 0);
			const baseTotal = data.currentTotal - existingAmount;
			const targetTotal = -data.targetAmount;
			const adjustmentAmount =
				Math.round((targetTotal - baseTotal) * 100) / 100;

			if (adjustmentAmount === 0) {
				if (existing) {
					await tx.delete(transactions).where(eq(transactions.id, existing.id));
					message = "Ajuste de fatura removido.";
				} else {
					message = "Nada a ajustar — o valor já está correto.";
				}
				return;
			}

			const isExpense = adjustmentAmount < 0;
			const categoryName = isExpense ? "Outras despesas" : "Outras receitas";

			const category = await tx.query.categories.findFirst({
				columns: { id: true },
				where: and(
					eq(categories.userId, user.id),
					eq(categories.name, categoryName),
				),
			});

			const amount = formatDecimalForDbRequired(adjustmentAmount);

			const note = `O valor era ${formatCurrency(Math.abs(baseTotal))} mas o correto é ${formatCurrency(data.targetAmount)}.`;

			const payload = {
				condition: "À vista",
				name: INVOICE_ADJUSTMENT_NAME,
				paymentMethod: "Cartão de crédito",
				note,
				amount,
				purchaseDate: getBusinessTodayDate(),
				transactionType: isExpense
					? ("Despesa" as const)
					: ("Receita" as const),
				period: data.period,
				userId: user.id,
				cardId: data.cardId,
				accountId: null,
				categoryId: category?.id ?? null,
				payerId: adminPayerId,
			};

			if (existing) {
				await tx
					.update(transactions)
					.set(payload)
					.where(eq(transactions.id, existing.id));
			} else {
				await tx.insert(transactions).values(payload);
			}
		});

		revalidateForEntity("cards", user.id);

		return { success: true, message };
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
