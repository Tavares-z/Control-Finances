"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { subscriptions } from "@/db/schema";
import {
	type ActionResult,
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { getUser } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import {
	dayOfMonthSchema,
	noteSchema,
	requiredDecimalSchema,
	uuidSchema,
} from "@/shared/lib/schemas/common";

const subscriptionBaseSchema = z.object({
	name: z
		.string({ message: "Informe o nome da assinatura." })
		.trim()
		.min(1, "Informe o nome da assinatura."),
	amount: z.union([
		z.number().positive("O valor deve ser maior que zero."),
		z
			.string()
			.trim()
			.transform((value) =>
				value.length === 0 ? "0" : value.replace(",", "."),
			)
			.refine(
				(value) => !Number.isNaN(Number.parseFloat(value)),
				"Informe um valor válido.",
			)
			.transform((value) => Number.parseFloat(value))
			.refine((value) => value > 0, "O valor deve ser maior que zero."),
	]),
	paymentMethod: z
		.string({ message: "Selecione a forma de pagamento." })
		.trim()
		.min(1, "Selecione a forma de pagamento."),
	billingDay: z
		.union([z.number(), z.string()])
		.transform((value) => String(value))
		.pipe(dayOfMonthSchema)
		.transform((value) => Number.parseInt(value, 10)),
	startDate: z.coerce.date({ message: "Informe a data de início." }),
	endDate: z.coerce.date().optional().nullable(),
	icon: z.string().trim().optional().nullable(),
	note: noteSchema,
	accountId: uuidSchema("Conta").optional().nullable(),
	cardId: uuidSchema("Cartão").optional().nullable(),
	categoryId: uuidSchema("Categoria").optional().nullable(),
	payerId: uuidSchema("Pessoa").optional().nullable(),
});

const createSubscriptionSchema = subscriptionBaseSchema;
const updateSubscriptionSchema = subscriptionBaseSchema.extend({
	id: uuidSchema("Assinatura"),
});
const idSchema = z.object({ id: uuidSchema("Assinatura") });

type CreateSubscriptionInput = z.input<typeof createSubscriptionSchema>;
type UpdateSubscriptionInput = z.input<typeof updateSubscriptionSchema>;

export async function createSubscriptionAction(
	input: CreateSubscriptionInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = createSubscriptionSchema.parse(input);

		await db.insert(subscriptions).values({
			name: data.name,
			amount: String(data.amount),
			paymentMethod: data.paymentMethod,
			billingDay: data.billingDay,
			startDate: data.startDate,
			endDate: data.endDate ?? null,
			icon: data.icon ?? null,
			note: data.note ?? null,
			accountId: data.accountId ?? null,
			cardId: data.cardId ?? null,
			categoryId: data.categoryId ?? null,
			payerId: data.payerId ?? null,
			status: "ativa",
			userId: user.id,
		});

		revalidateForEntity("subscriptions", user.id);

		return { success: true, message: "Assinatura criada com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function updateSubscriptionAction(
	input: UpdateSubscriptionInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = updateSubscriptionSchema.parse(input);

		const [updated] = await db
			.update(subscriptions)
			.set({
				name: data.name,
				amount: String(data.amount),
				paymentMethod: data.paymentMethod,
				billingDay: data.billingDay,
				startDate: data.startDate,
				endDate: data.endDate ?? null,
				icon: data.icon ?? null,
				note: data.note ?? null,
				accountId: data.accountId ?? null,
				cardId: data.cardId ?? null,
				categoryId: data.categoryId ?? null,
				payerId: data.payerId ?? null,
				updatedAt: new Date(),
			})
			.where(
				and(eq(subscriptions.id, data.id), eq(subscriptions.userId, user.id)),
			)
			.returning({ id: subscriptions.id });

		if (!updated) {
			return { success: false, error: "Assinatura não encontrada." };
		}

		revalidateForEntity("subscriptions", user.id);

		return { success: true, message: "Assinatura atualizada com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function pauseSubscriptionAction(
	input: z.input<typeof idSchema>,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = idSchema.parse(input);

		const [updated] = await db
			.update(subscriptions)
			.set({ status: "pausada", updatedAt: new Date() })
			.where(
				and(eq(subscriptions.id, data.id), eq(subscriptions.userId, user.id)),
			)
			.returning({ id: subscriptions.id });

		if (!updated) {
			return { success: false, error: "Assinatura não encontrada." };
		}

		revalidateForEntity("subscriptions", user.id);

		return { success: true, message: "Assinatura pausada." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function reactivateSubscriptionAction(
	input: z.input<typeof idSchema>,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = idSchema.parse(input);

		const [updated] = await db
			.update(subscriptions)
			.set({ status: "ativa", updatedAt: new Date() })
			.where(
				and(eq(subscriptions.id, data.id), eq(subscriptions.userId, user.id)),
			)
			.returning({ id: subscriptions.id });

		if (!updated) {
			return { success: false, error: "Assinatura não encontrada." };
		}

		revalidateForEntity("subscriptions", user.id);

		return { success: true, message: "Assinatura reativada com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function cancelSubscriptionAction(
	input: z.input<typeof idSchema>,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = idSchema.parse(input);

		const [updated] = await db
			.update(subscriptions)
			.set({ status: "cancelada", updatedAt: new Date() })
			.where(
				and(eq(subscriptions.id, data.id), eq(subscriptions.userId, user.id)),
			)
			.returning({ id: subscriptions.id });

		if (!updated) {
			return { success: false, error: "Assinatura não encontrada." };
		}

		revalidateForEntity("subscriptions", user.id);

		return { success: true, message: "Assinatura cancelada." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function deleteSubscriptionAction(
	input: z.input<typeof idSchema>,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = idSchema.parse(input);

		const [deleted] = await db
			.delete(subscriptions)
			.where(
				and(eq(subscriptions.id, data.id), eq(subscriptions.userId, user.id)),
			)
			.returning({ id: subscriptions.id });

		if (!deleted) {
			return { success: false, error: "Assinatura não encontrada." };
		}

		revalidateForEntity("subscriptions", user.id);

		return { success: true, message: "Assinatura removida com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}

const syncAmountSchema = z.object({
	id: uuidSchema("Assinatura"),
	amount: requiredDecimalSchema("valor"),
});

/**
 * Updates a subscription's expected amount, used when the confirmed
 * transaction amount differs from what was cadastrado (price change).
 */
export async function syncSubscriptionAmountAction(
	input: z.input<typeof syncAmountSchema>,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = syncAmountSchema.parse(input);

		const [updated] = await db
			.update(subscriptions)
			.set({ amount: String(data.amount), updatedAt: new Date() })
			.where(
				and(eq(subscriptions.id, data.id), eq(subscriptions.userId, user.id)),
			)
			.returning({ id: subscriptions.id });

		if (!updated) {
			return { success: false, error: "Assinatura não encontrada." };
		}

		revalidateForEntity("subscriptions", user.id);

		return { success: true, message: "Valor da assinatura atualizado." };
	} catch (error) {
		return handleActionError(error);
	}
}
