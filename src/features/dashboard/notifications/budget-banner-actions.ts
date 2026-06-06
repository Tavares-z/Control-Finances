"use server";

import { z } from "zod";
import { dashboardNotificationStates } from "@/db/schema";
import { handleActionError } from "@/shared/lib/actions/helpers";
import { getUser } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import type { ActionResult } from "@/shared/lib/types/actions";

const dismissSchema = z.object({
  notificationKey: z.string().min(1),
  fingerprint: z.string().min(1),
});

type DismissInput = z.infer<typeof dismissSchema>;

export async function dismissBudgetNotificationAction(
  input: DismissInput,
): Promise<ActionResult> {
  try {
    const user = await getUser();
    const data = dismissSchema.parse(input);
    const now = new Date();

    await db
      .insert(dashboardNotificationStates)
      .values({
        userId: user.id,
        notificationKey: data.notificationKey,
        fingerprint: data.fingerprint,
        readAt: now,
        archivedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          dashboardNotificationStates.userId,
          dashboardNotificationStates.notificationKey,
        ],
        set: {
          fingerprint: data.fingerprint,
          readAt: now,
          archivedAt: now,
          updatedAt: now,
        },
      });

    return { success: true, message: "Notificação dispensada." };
  } catch (error) {
    return handleActionError(error);
  }
}