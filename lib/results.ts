import { prisma } from "@/lib/db";
import type { DiffFile, ResultOrigin, ReviewQueueItem, ReviewStatus } from "@/types";

function diffCounts(diffJson: string): {
  additions: number;
  deletions: number;
  fileCount: number;
} {
  try {
    const diff = JSON.parse(diffJson) as DiffFile[];
    let additions = 0;
    let deletions = 0;
    for (const f of diff) {
      additions += f.additions ?? 0;
      deletions += f.deletions ?? 0;
    }
    return { additions, deletions, fileCount: diff.length };
  } catch {
    return { additions: 0, deletions: 0, fileCount: 0 };
  }
}

/**
 * The result-centric review queue for a repo: every Result that is live in the
 * review lifecycle, regardless of origin (one-way execute flow or a task chat).
 *
 * "Live" = not yet merged, and still has something to act on — an active worktree
 * (awaiting review / PR) or an already-opened PR. This naturally drops merged work
 * and rolled-back/abandoned results (worktree cleared, no PR), so diffs "come and go".
 */
export async function pendingReviewResults(
  repoFullName: string,
): Promise<ReviewQueueItem[]> {
  const results = await prisma.result.findMany({
    where: {
      task: { repoFullName },
      prMergedAt: null,
      OR: [{ worktreePath: { not: null } }, { prNumber: { not: null } }],
    },
    include: { task: { select: { title: true, prompt: true, repoFullName: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return results.map((r) => {
    const counts = diffCounts(r.diffJson);
    return {
      id: r.id,
      taskId: r.taskId,
      taskTitle: r.task.title,
      taskPrompt: r.task.prompt,
      repoFullName: r.task.repoFullName,
      origin: r.origin as ResultOrigin,
      reviewStatus: r.reviewStatus as ReviewStatus,
      additions: counts.additions,
      deletions: counts.deletions,
      fileCount: counts.fileCount,
      prNumber: r.prNumber,
      prUrl: r.prUrl,
      prMerged: r.prMergedAt != null,
      updatedAt: r.updatedAt.toISOString(),
    };
  });
}
