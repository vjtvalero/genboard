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

// Result-centric review view. Works for any origin (one-way execute flow or task chat).
export default async function ResultPage({
  params,
}: {
  params: { resultId: string };
}) {
  const result = await prisma.result.findUnique({
    where: { id: params.resultId },
    include: { review: true, task: true },
  });
  if (!result) notFound();

  const session = await auth();
  const user = session?.githubLogin ? await getUserByLogin(session.githubLogin) : null;
  if (!user || !(await userCanAccessRepository(user, result.task.repoFullName))) notFound();

  // Reconcile the PR's merge state with GitHub so a merge-then-reload flips merged
  // state automatically. Best-effort; no-op once already merged.
  const prMergedAt = await syncPrMergeState(
    {
      id: result.id,
      taskId: result.taskId,
      prNumber: result.prNumber,
      prMergedAt: result.prMergedAt,
      task: { repoFullName: result.task.repoFullName, status: result.task.status },
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
    <div>
      <div className="px-6 pt-4 text-sm text-neutral-400">
        <Link href="/review" className="hover:text-neutral-100">
          ← Review Queue
        </Link>
      </div>
      <DiffWorkspace
        resultId={result.id}
        taskId={result.taskId}
        taskTitle={result.task.title}
        repoFullName={result.task.repoFullName}
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
    </div>
  );
}
