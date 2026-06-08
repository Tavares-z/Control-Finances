"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { goals } from "@/db/schema";
import {
	type ActionResult,
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { getUser } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { noteSchema, uuidSchema } from "@/shared/lib/schemas/common";

const goalBaseSchema = z.object({
	name: z
		.string({ message: "Informe o nome da meta." })
		.trim()
		.min(1, "Informe o nome da meta."),
	targetAmount: z.union([
		z.number().positive("O valor deve ser maior que zero."),
		z
			.string()
			.trim()
			.transform((value) => (value.length === 0 ? "0" : value.replace(",", ".")))
			.refine(
				(value) => !Number.isNaN(Number.parseFloat(value)),
				"Informe um valor válido.",
			)
			.transform((value) => Number.parseFloat(value))
			.refine((value) => value > 0, "O valor deve ser maior que zero."),
	]),
	deadline: z.coerce.date().optional().nullable(),
	icon: z.string().trim().optional().nullable(),
	note: noteSchema,
	accountId: uuidSchema("Conta").optional().nullable(),
});

const createGoalSchema = goalBaseSchema;
const updateGoalSchema = goalBaseSchema.extend({
	id: uuidSchema("Meta"),
});
const idSchema = z.object({ id: uuidSchema("Meta") });

type CreateGoalInput = z.input<typeof createGoalSchema>;
type UpdateGoalInput = z.input<typeof updateGoalSchema>;

export async function createGoalAction(
	input: CreateGoalInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = createGoalSchema.parse(input);

		await db.insert(goals).values({
			name: data.name,
			targetAmount: String(data.targetAmount),
			deadline: data.deadline ?? null,
			icon: data.icon ?? null,
			note: data.note ?? null,
			accountId: data.accountId ?? null,
			status: "ativa",
			userId: user.id,
		});

		revalidateForEntity("goals", user.id);

		return { success: true, message: "Meta criada com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function updateGoalAction(
	input: UpdateGoalInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = updateGoalSchema.parse(input);

		const [updated] = await db
			.update(goals)
			.set({
				name: data.name,
				targetAmount: String(data.targetAmount),
				deadline: data.deadline ?? null,
				icon: data.icon ?? null,
				note: data.note ?? null,
				accountId: data.accountId ?? null,
				updatedAt: new Date(),
			})
			.where(and(eq(goals.id, data.id), eq(goals.userId, user.id)))
			.returning({ id: goals.id });

		if (!updated) {
			return { success: false, error: "Meta não encontrada." };
		}

		revalidateForEntity("goals", user.id);

		return { success: true, message: "Meta atualizada com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function completeGoalAction(
	input: z.input<typeof idSchema>,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = idSchema.parse(input);

		const [updated] = await db
			.update(goals)
			.set({ status: "concluida", updatedAt: new Date() })
			.where(and(eq(goals.id, data.id), eq(goals.userId, user.id)))
			.returning({ id: goals.id });

		if (!updated) {
			return { success: false, error: "Meta não encontrada." };
		}

		revalidateForEntity("goals", user.id);

		return { success: true, message: "Meta concluída! 🎉" };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function reactivateGoalAction(
	input: z.input<typeof idSchema>,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = idSchema.parse(input);

		const [updated] = await db
			.update(goals)
			.set({ status: "ativa", updatedAt: new Date() })
			.where(and(eq(goals.id, data.id), eq(goals.userId, user.id)))
			.returning({ id: goals.id });

		if (!updated) {
			return { success: false, error: "Meta não encontrada." };
		}

		revalidateForEntity("goals", user.id);

		return { success: true, message: "Meta reativada com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function archiveGoalAction(
	input: z.input<typeof idSchema>,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = idSchema.parse(input);

		const [updated] = await db
			.update(goals)
			.set({ status: "arquivada", updatedAt: new Date() })
			.where(and(eq(goals.id, data.id), eq(goals.userId, user.id)))
			.returning({ id: goals.id });

		if (!updated) {
			return { success: false, error: "Meta não encontrada." };
		}

		revalidateForEntity("goals", user.id);

		return { success: true, message: "Meta arquivada com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function deleteGoalAction(
	input: z.input<typeof idSchema>,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = idSchema.parse(input);

		const [deleted] = await db
			.delete(goals)
			.where(and(eq(goals.id, data.id), eq(goals.userId, user.id)))
			.returning({ id: goals.id });

		if (!deleted) {
			return { success: false, error: "Meta não encontrada." };
		}

		revalidateForEntity("goals", user.id);

		return { success: true, message: "Meta removida com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}