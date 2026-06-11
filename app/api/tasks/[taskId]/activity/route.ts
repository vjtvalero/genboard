import { forbidden, json, notFound, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { userCanAccessRepository } from "@/lib/repositories";

export const dynamic = "force-dynamic";

// GET /api/tasks/[taskId]/activity — ordered ActivityEvent trail.
export async function GET(_req: Request, { params }: { params: { taskId: string } }) {
  const ctx = await requireUser();
  if (ctx instanceof Response) return ctx;

  const task = await prisma.task.findUnique({ where: { id: params.taskId } });
  if (!task) return notFound("Task not found");
  if (!(await userCanAccessRepository(ctx.user, task.repoFullName))) {
    return forbidden("You do not have access to this repository.");
  }

  const events = await prisma.activityEvent.findMany({
    where: { taskId: params.taskId },
    include: { actor: true },
    orderBy: { createdAt: "asc" },
  });
  return json({
    events: events.map((event) => ({
      id: event.id,
      kind: event.kind,
      actorMode: event.actorMode,
      actorLogin: event.actor?.githubLogin ?? null,
      detail: event.detail,
      createdAt: event.createdAt,
    })),
  });
}
