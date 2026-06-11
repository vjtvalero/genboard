import { badRequest, notFound, serverError, json, requireUser, forbidden } from "@/lib/api";
import { prisma } from "@/lib/db";
import { userCanAccessRepository } from "@/lib/repositories";
import type { Priority, TaskStatus } from "@/types";

export const dynamic = "force-dynamic";

const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];
const STATUSES: TaskStatus[] = [
  "backlog", "running", "executed", "in_review",
  "changes_requested", "approved", "pr_opened", "pushed", "failed",
];

// GET /api/tasks/[taskId] — task + results + events.
export async function GET(_req: Request, { params }: { params: { taskId: string } }) {
  const ctx = await requireUser();
  if (ctx instanceof Response) return ctx;

  const task = await prisma.task.findUnique({
    where: { id: params.taskId },
    include: {
      results: { orderBy: { createdAt: "desc" } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!task) return notFound("Task not found");
  if (!(await userCanAccessRepository(ctx.user, task.repoFullName))) {
    return forbidden("You do not have access to this repository.");
  }
  return json({ task });
}

// PATCH /api/tasks/[taskId] — update title, prompt, priority, or status.
export async function PATCH(req: Request, { params }: { params: { taskId: string } }) {
  const ctx = await requireUser();
  if (ctx instanceof Response) return ctx;

  let body: Partial<{ title: string; prompt: string; priority: Priority; status: TaskStatus }>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const data: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (typeof body.prompt === "string" && body.prompt.trim()) data.prompt = body.prompt.trim();
  if (body.priority && PRIORITIES.includes(body.priority)) data.priority = body.priority;
  if (body.status && STATUSES.includes(body.status)) data.status = body.status;

  if (Object.keys(data).length === 0) return badRequest("No valid fields to update");

  try {
    const existing = await prisma.task.findUnique({ where: { id: params.taskId } });
    if (!existing) return notFound("Task not found");
    if (!(await userCanAccessRepository(ctx.user, existing.repoFullName))) {
      return forbidden("You do not have access to this repository.");
    }
    const task = await prisma.task.update({ where: { id: params.taskId }, data });
    return json({ task });
  } catch (err) {
    return serverError((err as Error).message);
  }
}

// DELETE /api/tasks/[taskId]
export async function DELETE(_req: Request, { params }: { params: { taskId: string } }) {
  const ctx = await requireUser();
  if (ctx instanceof Response) return ctx;
  try {
    const existing = await prisma.task.findUnique({ where: { id: params.taskId } });
    if (!existing) return notFound("Task not found");
    if (!(await userCanAccessRepository(ctx.user, existing.repoFullName))) {
      return forbidden("You do not have access to this repository.");
    }
    await prisma.task.delete({ where: { id: params.taskId } });
    return json({ ok: true });
  } catch (err) {
    return serverError((err as Error).message);
  }
}
