import { and, eq } from "drizzle-orm";
import { cards, categories, financialAccounts, transactions } from "@/db/schema";
import { revalidateForEntity } from "@/shared/lib/actions/helpers";
import { db } from "@/shared/lib/db";
import { centsToDecimalString } from "@/features/transactions/actions/core";
import { addMonthsToDate, parseLocalDateString } from "@/shared/utils/date";
import { addMonthsToPeriod, derivePeriodFromDate } from "@/shared/utils/period";

export type RegisterTransactionParams = {
	name: string;
	amount: number;
	transactionType: "Despesa" | "Receita";
	condition: "À vista" | "Parcelado" | "Recorrente";
	paymentMethod: string;
	purchaseDate: string;
	accountId: string | null;
	cardId: string | null;
	categoryId: string | null;
	isSettled: boolean;
	note: string | null;
	installmentCount?: number | null;
	recurrenceCount?: number | null;
};

type ToolResult =
	| { success: true; summary: string }
	| { success: false; error: string };

export async function executeRegisterTransaction(
	userId: string,
	params: RegisterTransactionParams,
): Promise<ToolResult> {
	try {
		// Validar ownership da conta
		if (params.accountId) {
			const account = await db.query.financialAccounts.findFirst({
				columns: { id: true },
				where: and(
					eq(financialAccounts.id, params.accountId),
					eq(financialAccounts.userId, userId),
				),
			});
			if (!account) return { success: false, error: "Conta não encontrada." };
		}

		// Validar ownership do cartão
		if (params.cardId) {
			const card = await db.query.cards.findFirst({
				columns: { id: true },
				where: and(eq(cards.id, params.cardId), eq(cards.userId, userId)),
			});
			if (!card) return { success: false, error: "Cartão não encontrado." };
		}

		// Validar ownership da categoria
		if (params.categoryId) {
			const category = await db.query.categories.findFirst({
				columns: { id: true },
				where: and(
					eq(categories.id, params.categoryId),
					eq(categories.userId, userId),
				),
			});
			if (!category) return { success: false, error: "Categoria não encontrada." };
		}

		// Validar campos obrigatórios por método de pagamento
		if (params.paymentMethod === "Cartão de crédito" && !params.cardId) {
			return { success: false, error: "Informe o cartão de crédito." };
		}
		if (params.paymentMethod !== "Cartão de crédito" && !params.accountId) {
			return { success: false, error: "Informe a conta de pagamento." };
		}

		// Validar data
		const purchaseDate = parseLocalDateString(params.purchaseDate);
		if (Number.isNaN(purchaseDate.getTime())) {
			return { success: false, error: `Data inválida: ${params.purchaseDate}` };
		}

		const period = derivePeriodFromDate(params.purchaseDate);
		const amountSign = params.transactionType === "Receita" ? 1 : -1;
		const amountCents = Math.round(params.amount * 100);
		const isSettledValue =
			params.paymentMethod === "Cartão de crédito" ? null : params.isSettled;

		const baseRecord = {
			name: params.name,
			transactionType: params.transactionType,
			condition: params.condition,
			paymentMethod: params.paymentMethod,
			accountId: params.accountId ?? null,
			cardId: params.cardId ?? null,
			categoryId: params.categoryId ?? null,
			note: params.note ?? null,
			userId,
			isDivided: false,
		};

		// Parcelado
		if (
			params.condition === "Parcelado" &&
			params.installmentCount &&
			params.installmentCount >= 2
		) {
			const installmentCents = Math.floor(amountCents / params.installmentCount);
			const remainder = amountCents - installmentCents * params.installmentCount;

			const records = Array.from({ length: params.installmentCount }, (_, i) => ({
				...baseRecord,
				amount: centsToDecimalString(
					(installmentCents + (i === 0 ? remainder : 0)) * amountSign,
				),
				purchaseDate,
				period: addMonthsToPeriod(period, i),
				isSettled: i === 0 ? isSettledValue : false,
				installmentCount: params.installmentCount,
				currentInstallment: i + 1,
			}));

			await db.insert(transactions).values(records);
		}
		// Recorrente
		else if (
			params.condition === "Recorrente" &&
			params.recurrenceCount &&
			params.recurrenceCount >= 2
		) {
			const records = Array.from({ length: params.recurrenceCount }, (_, i) => ({
				...baseRecord,
				amount: centsToDecimalString(amountCents * amountSign),
				purchaseDate: addMonthsToDate(purchaseDate, i),
				period: addMonthsToPeriod(period, i),
				isSettled: i === 0 ? isSettledValue : false,
				recurrenceCount: params.recurrenceCount,
			}));

			await db.insert(transactions).values(records);
		}
		// À vista
		else {
			await db.insert(transactions).values({
				...baseRecord,
				amount: centsToDecimalString(amountCents * amountSign),
				purchaseDate,
				period,
				isSettled: isSettledValue,
				condition: "À vista",
			});
		}

		revalidateForEntity("transactions", userId);

		const amountFormatted = new Intl.NumberFormat("pt-BR", {
			style: "currency",
			currency: "BRL",
		}).format(params.amount);

		return {
			success: true,
			summary: `${params.transactionType} "${params.name}" de ${amountFormatted} registrada com sucesso!`,
		};
	} catch (error) {
		console.error("Erro ao registrar transação via chat:", error);
		return { success: false, error: "Erro interno ao registrar. Tente novamente." };
	}
}