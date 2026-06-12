import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getPullRequestState } from "./repos";

interface MergeSyncResult {
  id: string;
  taskId: string;
  prNumber: number | null;
  prMergedAt: Date | null;
  task: { repoFullName: string; status: string };
}

/**
 * Best-effort reconciliation of a result's PR merge state with GitHub. Called
 * on diff-page load so that merging the PR on GitHub and reloading flips the
 * task to "merged" without any manual action.
 *
 * Once a merge is observed it is persisted (prMergedAt + task.status="merged"),
 * so subsequent loads short-circuit without hitting the GitHub API. Network or
 * API errors are swallowed and the last-known state is returned.
 */
export async function syncPrMergeState(
  result: MergeSyncResult,
  token: string | undefined,
  actorUserId?: string | null,
): Promise<Date | null> {
  if (result.prMergedAt) return result.prMergedAt; // already known merged
  if (!result.prNumber || !token) return null;

  try {
    const pr = await getPullRequestState(token, result.task.repoFullName, result.prNumber);
    if (!pr.merged) return null;

    const mergedAt = pr.mergedAt ?? new Date();
    await prisma.result.update({
      where: { id: result.id },
      data: { prMergedAt: mergedAt },
    });
    if (result.task.status !== "merged") {
      await prisma.task.update({
        where: { id: result.taskId },
        data: { status: "merged" },
      });
      await logActivity(
        result.taskId,
        "merged",
        "se",
        `PR #${result.prNumber} merged`,
        actorUserId,
      );
    }
    return mergedAt;
  } catch {
    return result.prMergedAt;
  }
}
