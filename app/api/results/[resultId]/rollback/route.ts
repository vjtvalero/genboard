import { badRequest, forbidden, notFound, serverError, json, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { assertWorktreePath, removeTaskWorktree } from "@/lib/workspace/config";
import { rollbackPatches, type StoredPatch } from "@/lib/patches";
import { userCanAccessRepository } from "@/lib/repositories";

export const dynamic = "force-dynamic";

// POST /api/results/[resultId]/rollback — restore the pre-write file snapshots.
export async function POST(_req: Request, { params }: { params: { resultId: string } }) {
  const ctx = await requireUser();
  if (ctx instanceof Response) return ctx;

  const result = await prisma.result.findUnique({
    where: { id: params.resultId },
    include: { task: true },
  });
  if (!result) return notFound("Result not found");
  if (!(await userCanAccessRepository(ctx.user, result.task.repoFullName))) {
    return forbidden("You do not have access to this repository.");
  }

  if (result.commitSha) {
    return badRequest("This result was already promoted to a pull request; rollback is unavailable.");
  }

  let stored: StoredPatch[];
  try {
    stored = JSON.parse(result.patchesJson);
  } catch {
    return serverError("Stored patches are corrupted.");
  }

  try {
    const root = await assertWorktreePath(result.worktreePath);
    await rollbackPatches(root, stored);
    await removeTaskWorktree(result.task.repoFullName, root);

    // Mirror onto the board task only for the one-way execute flow (see review route).
    if (result.origin === "execute") {
      await prisma.task
        .update({ where: { id: result.taskId }, data: { status: "backlog" } })
        .catch(() => {});
    }
    // Discarding a chat result resets its session so the next turn starts clean.
    if (result.origin === "chat" && result.chatSessionId) {
      await prisma.chatSession
        .update({
          where: { id: result.chatSessionId },
          data: { worktreePath: null, baseSha: null, resultId: null },
        })
        .catch(() => {});
    }
    await prisma.result.update({
      where: { id: result.id },
      data: { worktreePath: null },
    });
    await logActivity(result.taskId, "rolled_back", "pm", "Restored original files", ctx.user.id);

    return json({ ok: true });
  } catch (err) {
    return serverError((err as Error).message);
  }
}
