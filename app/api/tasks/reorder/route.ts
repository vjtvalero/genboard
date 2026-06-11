import { badRequest, forbidden, serverError, json, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { userCanAccessRepository } from "@/lib/repositories";

export const dynamic = "force-dynamic";

// POST /api/tasks/reorder — { orderedIds: string[] } persists manual backlog order.
export async function POST(req: Request) {
  const ctx = await requireUser();
  if (ctx instanceof Response) return ctx;

  let body: { orderedIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (!Array.isArray(body.orderedIds) || body.orderedIds.length === 0) {
    return badRequest("orderedIds (non-empty array) is required");
  }

  try {
    const tasks = await prisma.task.findMany({
      where: { id: { in: body.orderedIds } },
      select: { id: true, repoFullName: true },
    });
    const repoNames = new Set(tasks.map((task) => task.repoFullName));
    if (tasks.length !== body.orderedIds.length || repoNames.size !== 1) {
      return badRequest("orderedIds must all belong to one repository");
    }
    const [repoFullName] = repoNames;
    if (!repoFullName || !(await userCanAccessRepository(ctx.user, repoFullName))) {
      return forbidden("You do not have access to this repository.");
    }

    await prisma.$transaction(
      body.orderedIds.map((id, index) =>
        prisma.task.update({ where: { id }, data: { order: index } }),
      ),
    );
    // Record a single reorder event against the first task as a marker.
    await logActivity(body.orderedIds[0], "reordered", "pm", "Backlog reordered", ctx.user.id);
    return json({ ok: true });
  } catch (err) {
    return serverError((err as Error).message);
  }
}
