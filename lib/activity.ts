import { prisma } from "./db";
import type { ActivityKind, Mode } from "@/types";

/** Append an activity event to a task's trail. */
export async function logActivity(
  taskId: string,
  kind: ActivityKind,
  actorMode: Mode,
  detail = "",
  userId?: string | null,
): Promise<void> {
  await prisma.activityEvent.create({
    data: { taskId, kind, actorMode, detail, userId: userId ?? null },
  });
}
