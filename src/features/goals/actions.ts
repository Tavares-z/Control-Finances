"use server";

import crypto, { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { attachments, goals } from "@/db/schema";
import {
	type ActionResult,
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { getUser } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import {
	GOAL_COVER_MAX_SIZE_BYTES,
	GOAL_COVER_MAX_SIZE_MB,
} from "@/features/goals/lib/goal-cover-config";
import { noteSchema, uuidSchema } from "@/shared/lib/schemas/common";
import {
	createPresignedPutUrl,
	deleteS3Object,
	headS3Object,
} from "@/shared/lib/storage/presign";

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

// ===================== IMAGEM DE CAPA =====================

const GOAL_COVER_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
] as const;

const UPLOAD_TOKEN_EXPIRY_SECONDS = 10 * 60;

const coverPresignSchema = z.object({
	fileName: z.string().min(1),
	mimeType: z.enum(GOAL_COVER_MIME_TYPES),
	fileSize: z
		.number()
		.max(
			GOAL_COVER_MAX_SIZE_BYTES,
			`A imagem deve ter no máximo ${GOAL_COVER_MAX_SIZE_MB}MB.`,
		),
	goalId: uuidSchema("Meta"),
});

const coverConfirmSchema = z.object({
	uploadToken: z.string().min(1),
});

type CoverPresignResult =
	| {
			success: true;
			presignedUrl: string;
			fileKey: string;
			uploadToken: string;
	  }
	| { success: false; error: string };

type CoverUploadTokenPayload = {
	userId: string;
	goalId: string;
	fileKey: string;
	fileName: string;
	mimeType: (typeof GOAL_COVER_MIME_TYPES)[number];
	fileSize: number;
	exp: number;
};

function getUploadTokenSecret(): string {
	const secret = process.env.BETTER_AUTH_SECRET;
	if (!secret) {
		throw new Error(
			"BETTER_AUTH_SECRET is required. Set it in your .env file.",
		);
	}
	return secret;
}

function base64UrlEncode(value: string): string {
	return Buffer.from(value)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");
}

function base64UrlDecode(value: string): string {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const pad = normalized.length % 4;
	const padded = pad ? normalized + "=".repeat(4 - pad) : normalized;
	return Buffer.from(padded, "base64").toString("utf8");
}

function signCoverUploadToken(payload: CoverUploadTokenPayload): string {
	const encodedPayload = base64UrlEncode(JSON.stringify(payload));
	const signature = crypto
		.createHmac("sha256", getUploadTokenSecret())
		.update(encodedPayload)
		.digest("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");

	return `${encodedPayload}.${signature}`;
}

function verifyCoverUploadToken(token: string): CoverUploadTokenPayload | null {
	try {
		const [encodedPayload, signature] = token.split(".");
		if (!encodedPayload || !signature) return null;

		const expectedSignature = crypto
			.createHmac("sha256", getUploadTokenSecret())
			.update(encodedPayload)
			.digest("base64")
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=/g, "");

		if (
			!crypto.timingSafeEqual(
				Buffer.from(signature),
				Buffer.from(expectedSignature),
			)
		) {
			return null;
		}

		const payload = JSON.parse(
			base64UrlDecode(encodedPayload),
		) as CoverUploadTokenPayload;
		const now = Math.floor(Date.now() / 1000);

		if (payload.exp < now) return null;
		if (!payload.fileKey.startsWith(`${payload.userId}/`)) return null;
		if (!GOAL_COVER_MIME_TYPES.includes(payload.mimeType)) return null;
		if (payload.fileSize <= 0 || payload.fileSize > GOAL_COVER_MAX_SIZE_BYTES) {
			return null;
		}

		return payload;
	} catch {
		return null;
	}
}

export async function getGoalCoverUploadUrlAction(input: {
	fileName: string;
	mimeType: string;
	fileSize: number;
	goalId: string;
}): Promise<CoverPresignResult> {
	try {
		const user = await getUser();
		const data = coverPresignSchema.parse(input);

		const [goal] = await db
			.select({ id: goals.id })
			.from(goals)
			.where(and(eq(goals.id, data.goalId), eq(goals.userId, user.id)));

		if (!goal) {
			return { success: false, error: "Meta não encontrada." };
		}

		const ext = data.fileName.split(".").pop()?.toLowerCase() ?? "bin";
		const fileKey = `${user.id}/goals/${randomUUID()}.${ext}`;
		const presignedUrl = await createPresignedPutUrl(fileKey, data.mimeType);
		const uploadToken = signCoverUploadToken({
			userId: user.id,
			goalId: data.goalId,
			fileKey,
			fileName: data.fileName,
			mimeType: data.mimeType,
			fileSize: data.fileSize,
			exp: Math.floor(Date.now() / 1000) + UPLOAD_TOKEN_EXPIRY_SECONDS,
		});

		return { success: true, presignedUrl, fileKey, uploadToken };
	} catch (error) {
		const result = handleActionError(error);
		if (!result.success) return { success: false, error: result.error };
		return { success: false, error: "Erro inesperado." };
	}
}

export async function confirmGoalCoverUploadAction(input: {
	uploadToken: string;
}): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = coverConfirmSchema.parse(input);
		const uploadPayload = verifyCoverUploadToken(data.uploadToken);

		if (!uploadPayload || uploadPayload.userId !== user.id) {
			return {
				success: false,
				error: "Upload de imagem inválido ou expirado.",
			};
		}

		const [goal] = await db
			.select({ id: goals.id, coverAttachmentId: goals.coverAttachmentId })
			.from(goals)
			.where(
				and(eq(goals.id, uploadPayload.goalId), eq(goals.userId, user.id)),
			);

		if (!goal) {
			return { success: false, error: "Meta não encontrada." };
		}

		const objectMetadata = await headS3Object(uploadPayload.fileKey);

		if (!objectMetadata.contentLength || objectMetadata.contentLength <= 0) {
			return { success: false, error: "Imagem enviada não encontrada." };
		}

		if (objectMetadata.contentLength > GOAL_COVER_MAX_SIZE_BYTES) {
			return {
				success: false,
				error: `A imagem enviada excede o limite permitido de ${GOAL_COVER_MAX_SIZE_MB}MB.`,
			};
		}

		if (objectMetadata.contentLength !== uploadPayload.fileSize) {
			return {
				success: false,
				error:
					"O tamanho da imagem enviada não confere com o upload autorizado.",
			};
		}

		if (objectMetadata.contentType !== uploadPayload.mimeType) {
			return {
				success: false,
				error: "O tipo da imagem enviada não confere com o upload autorizado.",
			};
		}

		const previousAttachmentId = goal.coverAttachmentId;

		const [attachment] = await db
			.insert(attachments)
			.values({
				userId: user.id,
				fileKey: uploadPayload.fileKey,
				fileName: uploadPayload.fileName,
				fileSize: uploadPayload.fileSize,
				mimeType: uploadPayload.mimeType,
			})
			.returning({ id: attachments.id });

		if (!attachment) {
			return { success: false, error: "Erro ao salvar a imagem." };
		}

		await db
			.update(goals)
			.set({ coverAttachmentId: attachment.id, updatedAt: new Date() })
			.where(eq(goals.id, goal.id));

		if (previousAttachmentId) {
			const [previous] = await db
				.select({ fileKey: attachments.fileKey })
				.from(attachments)
				.where(eq(attachments.id, previousAttachmentId));

			await db
				.delete(attachments)
				.where(eq(attachments.id, previousAttachmentId));

			if (previous) {
				await deleteS3Object(previous.fileKey);
			}
		}

		revalidateForEntity("goals", user.id);

		return { success: true, message: "Imagem da meta atualizada com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function removeGoalCoverAction(input: {
	goalId: string;
}): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = z.object({ goalId: uuidSchema("Meta") }).parse(input);

		const [goal] = await db
			.select({ id: goals.id, coverAttachmentId: goals.coverAttachmentId })
			.from(goals)
			.where(and(eq(goals.id, data.goalId), eq(goals.userId, user.id)));

		if (!goal) {
			return { success: false, error: "Meta não encontrada." };
		}

		if (!goal.coverAttachmentId) {
			return { success: true, message: "Meta não possui imagem." };
		}

		const [attachment] = await db
			.select({ fileKey: attachments.fileKey })
			.from(attachments)
			.where(eq(attachments.id, goal.coverAttachmentId));

		await db
			.update(goals)
			.set({ coverAttachmentId: null, updatedAt: new Date() })
			.where(eq(goals.id, goal.id));

		await db
			.delete(attachments)
			.where(eq(attachments.id, goal.coverAttachmentId));

		if (attachment) {
			await deleteS3Object(attachment.fileKey);
		}

		revalidateForEntity("goals", user.id);

		return { success: true, message: "Imagem removida com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}
