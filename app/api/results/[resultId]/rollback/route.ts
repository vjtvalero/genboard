import { getSession, unauthorized, badRequest, notFound, serverError, json } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getMode } from "@/lib/mode";
import { logActivity } from "@/lib/activity";
import { getWorkspacePath } from "@/lib/workspace/config";
import { assertRepoPath } from "@/lib/git/validate";
import { rollbackPatches, type StoredPatch } from "@/lib/patches";

export const dynamic = "force-dynamic";

// POST /api/results/[resultId]/rollback — restore the pre-write file snapshots.
export async function POST(_req: Request, { params }: { params: { resultId: string } }) {
  const session = await getSession();
  if (!session) return unauthorized();

  const result = await prisma.result.findUnique({
    where: { id: params.resultId },
    include: { task: true },
  });
  if (!result) return notFound("Result not found");

  if (result.commitSha) {
    return badRequest("This result was already pushed; rollback is unavailable.");
  }

  let stored: StoredPatch[];
  try {
    stored = JSON.parse(result.patchesJson);
  } catch {
    return serverError("Stored patches are corrupted.");
  }

  const localPath = await getWorkspacePath(result.task.repoFullName);
  if (!localPath) {
    return badRequest(`No local workspace linked for ${result.task.repoFullName}.`);
  }

  try {
    const root = await assertRepoPath(localPath);
    await rollbackPatches(root, stored);

    await prisma.task.update({
      where: { id: result.taskId },
      data: { status: "backlog" },
    });
    await logActivity(result.taskId, "rolled_back", getMode(), "Restored original files");

    return json({ ok: true });
  } catch (err) {
    return serverError((err as Error).message);
  }
}
