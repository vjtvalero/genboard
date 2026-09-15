import {
  badRequest,
  conflict,
  forbidden,
  json,
  notFound,
  requireUser,
  unauthorized,
} from "@/lib/api";
import { prisma } from "@/lib/db";
import { userCanAccessRepository } from "@/lib/repositories";
import { isUserRole, roleToMode } from "@/lib/users";
import { sseResponse } from "@/lib/sse";
import {
  isExecutionRunActive,
  markChatRunInterrupted,
  startChatTurn,
  streamExecutionRun,
} from "@/lib/execution/runner";
import type { ChatMessageView, Mode } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ACTIVE_RUN_STATUSES = ["queued", "running"];

function findActiveChatRun(chatSessionId: string) {
  return prisma.executionRun.findFirst({
    where: { chatSessionId, status: { in: ACTIVE_RUN_STATUSES } },
    orderBy: { createdAt: "desc" },
  });
}

function serialize(m: {
  id: string;
  role: string;
  content: string;
  resultId: string | null;
  createdAt: Date;
}): ChatMessageView {
  return {
    id: m.id,
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
    resultId: m.resultId,
    createdAt: m.createdAt.toISOString(),
  };
}

// GET /api/tasks/[taskId]/chat        — message history (+ active run id)
// GET /api/tasks/[taskId]/chat?stream=1 — SSE tail of the in-progress chat turn
export async function GET(req: Request, { params }: { params: { taskId: string } }) {
  const ctx = await requireUser();
  if (ctx instanceof Response) return ctx;

  const task = await prisma.task.findUnique({ where: { id: params.taskId } });
  if (!task) return notFound("Task not found");
  if (!(await userCanAccessRepository(ctx.user, task.repoFullName))) {
    return forbidden("You do not have access to this repository.");
  }

  const session = await prisma.chatSession.findUnique({ where: { taskId: task.id } });
  const wantsStream = new URL(req.url).searchParams.get("stream");

  if (wantsStream) {
    if (!ctx.session.accessToken) return unauthorized("Missing GitHub access token");
    if (!session) return badRequest("No chat for this task yet.");
    const run = await findActiveChatRun(session.id);
    if (!run) return badRequest("No active chat turn to tail.");
    if (run.status === "queued") {
      startChatTurn(run.id, ctx.session.accessToken);
    } else if (run.status === "running" && !isExecutionRunActive(run.id)) {
      await markChatRunInterrupted(run.id);
    }
    return sseResponse(streamExecutionRun(run.id));
  }

  const messages = session
    ? await prisma.chatMessage.findMany({
        where: { chatSessionId: session.id },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const activeRun = session ? await findActiveChatRun(session.id) : null;

  return json({
    messages: messages.map(serialize),
    activeRunId: activeRun?.id ?? null,
    resultId: session?.resultId ?? null,
  });
}

// POST /api/tasks/[taskId]/chat — send a chat turn; streams the assistant reply.
export async function POST(req: Request, { params }: { params: { taskId: string } }) {
  const ctx = await requireUser();
  if (ctx instanceof Response) return ctx;
  if (!ctx.session.accessToken) return unauthorized("Missing GitHub access token");

  const task = await prisma.task.findUnique({ where: { id: params.taskId } });
  if (!task) return notFound("Task not found");
  if (!(await userCanAccessRepository(ctx.user, task.repoFullName))) {
    return forbidden("You do not have access to this repository.");
  }

  let text = "";
  try {
    const body = await req.json();
    if (typeof body?.text === "string") text = body.text;
  } catch {
    /* no body */
  }
  if (!text.trim()) return badRequest("Message text is required.");

  const session = await prisma.chatSession.upsert({
    where: { taskId: task.id },
    create: { taskId: task.id },
    update: {},
  });

  // Serialize turns: only one chat turn may run per session at a time.
  let active = await findActiveChatRun(session.id);
  if (active?.status === "running" && !isExecutionRunActive(active.id)) {
    await markChatRunInterrupted(active.id);
    active = null;
  }
  if (active) {
    return conflict("A chat turn is already in progress. Wait for it to finish.");
  }

  const role = isUserRole(ctx.user.role) ? ctx.user.role : "pm";
  const mode: Mode = roleToMode(role);

  await prisma.chatMessage.create({
    data: { chatSessionId: session.id, role: "user", content: text.trim() },
  });

  const run = await prisma.executionRun.create({
    data: {
      taskId: task.id,
      userId: ctx.user.id,
      mode,
      origin: "chat",
      chatSessionId: session.id,
      status: "queued",
    },
  });

  // Empty assistant placeholder the runner fills in (tagged with the run id).
  await prisma.chatMessage.create({
    data: { chatSessionId: session.id, role: "assistant", content: "", runId: run.id },
  });

  startChatTurn(run.id, ctx.session.accessToken);
  return sseResponse(streamExecutionRun(run.id));
}
