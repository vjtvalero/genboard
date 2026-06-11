import { badRequest, forbidden, serverError, json, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import {
  accessibleRepositoriesForUser,
  getRepositoryByFullName,
  userCanAccessRepository,
} from "@/lib/repositories";
import type { Priority } from "@/types";

export const dynamic = "force-dynamic";

const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];
const BRANCH_RE = /^[A-Za-z0-9._/@-]+$/;

// GET /api/tasks?repo=owner/name&status=backlog — list tasks for a repo.
export async function GET(req: Request) {
  const ctx = await requireUser();
  if (ctx instanceof Response) return ctx;

  const { searchParams } = new URL(req.url);
  const repo = searchParams.get("repo");
  const status = searchParams.get("status");
  const accessibleRepos = repo
    ? []
    : await accessibleRepositoriesForUser(ctx.user);
  if (repo && !(await userCanAccessRepository(ctx.user, repo))) {
    return forbidden("You do not have access to this repository.");
  }

  const tasks = await prisma.task.findMany({
    where: {
      ...(repo ? { repoFullName: repo } : {}),
      ...(!repo ? { repoFullName: { in: accessibleRepos.map((r) => r.fullName) } } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  return json({ tasks });
}

// POST /api/tasks — { repoFullName, title, prompt, priority? } create a backlog task.
export async function POST(req: Request) {
  const ctx = await requireUser();
  if (ctx instanceof Response) return ctx;

  let body: {
    repoFullName?: string;
    title?: string;
    prompt?: string;
    priority?: Priority;
    branchName?: string;
  };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const { repoFullName, title, prompt } = body;
  if (!repoFullName) return badRequest("repoFullName is required");
  const repository = await getRepositoryByFullName(repoFullName);
  if (!repository?.enabled || !(await userCanAccessRepository(ctx.user, repoFullName))) {
    return forbidden("You do not have access to this repository.");
  }
  if (!title?.trim()) return badRequest("title is required");
  if (!prompt?.trim()) return badRequest("prompt is required");
  const branchName = body.branchName?.trim();
  if (!branchName) return badRequest("branchName is required");
  if (!BRANCH_RE.test(branchName) || branchName.includes("..") || branchName.endsWith(".")) {
    return badRequest("branchName is invalid");
  }
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
        repositoryId: repository.id,
        branchName,
        createdByUserId: ctx.user.id,
        title: title.trim(),
        prompt: prompt.trim(),
        priority,
        order,
        status: "backlog",
      },
    });

    await logActivity(task.id, "created", "pm", title.trim(), ctx.user.id);
    return json({ task }, { status: 201 });
  } catch (err) {
    return serverError((err as Error).message);
  }
}
