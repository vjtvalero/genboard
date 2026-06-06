import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
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
    />
  );
}
