import { getSession, unauthorized, badRequest, serverError, json } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getMode } from "@/lib/mode";
import { logActivity } from "@/lib/activity";
import type { Priority } from "@/types";

export const dynamic = "force-dynamic";

const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];

// GET /api/tasks?repo=owner/name&status=backlog — list tasks for a repo.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { searchParams } = new URL(req.url);
  const repo = searchParams.get("repo");
  const status = searchParams.get("status");

  const tasks = await prisma.task.findMany({
    where: {
      ...(repo ? { repoFullName: repo } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  return json({ tasks });
}

// POST /api/tasks — { repoFullName, title, prompt, priority? } create a backlog task.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  let body: {
    repoFullName?: string;
    title?: string;
    prompt?: string;
    priority?: Priority;
  };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const { repoFullName, title, prompt } = body;
  if (!repoFullName) return badRequest("repoFullName is required");
  if (!title?.trim()) return badRequest("title is required");
  if (!prompt?.trim()) return badRequest("prompt is required");
  const priority: Priority = PRIORITIES.includes(body.priority as Priority)
    ? (body.priority as Priority)
    : "medium";

  try {
    const max = await prisma.task.aggregate({
      where: { repoFullName },
      _max: { order: true },
    });
    const order = (max._max.order ?? -1) + 1;

    const task = await prisma.task.create({
      data: {
        repoFullName,
        title: title.trim(),
        prompt: prompt.trim(),
        priority,
        order,
        status: "backlog",
      },
    });

    await logActivity(task.id, "created", getMode(), title.trim());
    return json({ task }, { status: 201 });
  } catch (err) {
    return serverError((err as Error).message);
  }
}
