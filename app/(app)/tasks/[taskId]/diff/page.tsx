import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getUserByLogin } from "@/lib/users";
import { userCanAccessRepository } from "@/lib/repositories";
import { syncPrMergeState } from "@/lib/github/merge";
import DiffWorkspace from "@/components/diff/DiffWorkspace";
import type { AIReview, DiffFile, ReviewComment, ReviewStatus } from "@/types";

export const dynamic = "force-dynamic";

export default async function DiffPage({
  params,
}: {
  params: { taskId: string };
}) {
  const task = await prisma.task.findUnique({ where: { id: params.taskId } });
  if (!task) notFound();
  const session = await auth();
  const user = session?.githubLogin ? await getUserByLogin(session.githubLogin) : null;
  if (!user || !(await userCanAccessRepository(user, task.repoFullName))) notFound();

  // Prefer the task's latest result; fall back to most recent.
  const result = task.latestResultId
    ? await prisma.result.findUnique({
        where: { id: task.latestResultId },
        include: { review: true },
      })
    : await prisma.result.findFirst({
        where: { taskId: task.id },
        orderBy: { createdAt: "desc" },
        include: { review: true },
      });

  if (!result) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md text-center">
          <h2 className="text-lg font-semibold">No result yet</h2>
          <p className="mt-2 text-sm text-neutral-400">
            Execute this task first to produce a diff to review.
          </p>
          <Link
            href={`/tasks/${task.id}`}
            className="accent-text mt-4 inline-block text-sm hover:underline"
          >
            ← Back to task
          </Link>
        </div>
      </div>
    );
  }

  // Reconcile the PR's merge state with GitHub so a merge-then-reload flips the
  // task to "merged" automatically. Best-effort; no-op once already merged.
  const prMergedAt = await syncPrMergeState(
    {
      id: result.id,
      taskId: result.taskId,
      prNumber: result.prNumber,
      prMergedAt: result.prMergedAt,
      task: { repoFullName: task.repoFullName, status: task.status },
    },
    session?.accessToken,
    user.id,
  );

  let diff: DiffFile[] = [];
  let aiReview: AIReview | null = null;
  let comments: ReviewComment[] = [];
  try {
    diff = JSON.parse(result.diffJson);
  } catch {
    /* ignore */
  }
  try {
    aiReview = JSON.parse(result.aiReviewJson);
  } catch {
    /* ignore */
  }
  if (result.review) {
    try {
      comments = JSON.parse(result.review.commentsJson);
    } catch {
      /* ignore */
    }
  }

  return (
    <DiffWorkspace
      resultId={result.id}
      taskId={task.id}
      taskTitle={task.title}
      repoFullName={task.repoFullName}
      diff={diff}
      initialAiReview={aiReview}
      initialReviewStatus={result.reviewStatus as ReviewStatus}
      initialSummary={result.review?.summary ?? ""}
      initialComments={comments}
      initialCommitSha={result.commitSha}
      initialPrNumber={result.prNumber}
      initialPrUrl={result.prUrl}
      initialPrMerged={prMergedAt != null}
    />
  );
}
