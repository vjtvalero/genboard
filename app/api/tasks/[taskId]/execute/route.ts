import { badRequest, forbidden, notFound, requireUser, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/db";
import { isMode } from "@/lib/mode";
import { userCanAccessRepository } from "@/lib/repositories";
import { isUserRole, roleToMode } from "@/lib/users";
import { sseResponse } from "@/lib/sse";
import {
  isExecutionRunActive,
  markExecutionRunInterrupted,
  startExecutionRun,
  streamExecutionRun,
} from "@/lib/execution/runner";
import type { Mode } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ACTIVE_RUN_STATUSES = ["queued", "running"];

async function findActiveRun(taskId: string) {
  return prisma.executionRun.findFirst({
    where: { taskId, status: { in: ACTIVE_RUN_STATUSES } },
    orderBy: { createdAt: "desc" },
  });
}

// GET /api/tasks/[taskId]/execute — resume/tail the latest active execution run.
export async function GET(_req: Request, { params }: { params: { taskId: string } }) {
  const ctx = await requireUser();
  if (ctx instanceof Response) return ctx;
  if (!ctx.session.accessToken) return unauthorized("Missing GitHub access token");

  const task = await prisma.task.findUnique({ where: { id: params.taskId } });
  if (!task) return notFound("Task not found");
  if (!(await userCanAccessRepository(ctx.user, task.repoFullName))) {
    return forbidden("You do not have access to this repository.");
  }

  const run = await findActiveRun(task.id);
  if (!run) return badRequest("No active execution run for this task.");

  if (run.status === "queued") {
    startExecutionRun(run.id, ctx.session.accessToken);
  } else if (run.status === "running" && !isExecutionRunActive(run.id)) {
    await markExecutionRunInterrupted(run.id);
  }

  return sseResponse(streamExecutionRun(run.id));
}

// POST /api/tasks/[taskId]/execute — enqueue execution and stream persisted logs.
export async function POST(req: Request, { params }: { params: { taskId: string } }) {
  const ctx = await requireUser();
  if (ctx instanceof Response) return ctx;
  if (!ctx.session.accessToken) return unauthorized("Missing GitHub access token");

  const role = isUserRole(ctx.user.role) ? ctx.user.role : "pm";
  const task = await prisma.task.findUnique({ where: { id: params.taskId } });
  if (!task) return notFound("Task not found");
  if (!(await userCanAccessRepository(ctx.user, task.repoFullName))) {
    return forbidden("You do not have access to this repository.");
  }

  let mode: Mode = roleToMode(role);
  try {
    const body = await req.json();
    if (isMode(body?.mode)) mode = body.mode;
  } catch {
    // no body / not JSON — use role-derived mode
  }

  let run = await findActiveRun(task.id);
  if (run?.status === "running" && !isExecutionRunActive(run.id)) {
    await markExecutionRunInterrupted(run.id);
    run = null;
  }

  if (!run) {
    run = await prisma.executionRun.create({
      data: {
        taskId: task.id,
        userId: ctx.user.id,
        mode,
        status: "queued",
      },
    });
  }

  startExecutionRun(run.id, ctx.session.accessToken);
  return sseResponse(streamExecutionRun(run.id));
}
