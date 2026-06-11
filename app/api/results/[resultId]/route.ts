import { forbidden, notFound, json, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { userCanAccessRepository } from "@/lib/repositories";
import type { AIReview, DiffFile, ReviewComment } from "@/types";

export const dynamic = "force-dynamic";

// GET /api/results/[resultId] — result, parsed diff, cached AI review, SE review.
export async function GET(_req: Request, { params }: { params: { resultId: string } }) {
  const ctx = await requireUser();
  if (ctx instanceof Response) return ctx;

  const result = await prisma.result.findUnique({
    where: { id: params.resultId },
    include: { task: true, review: true },
  });
  if (!result) return notFound("Result not found");
  if (!(await userCanAccessRepository(ctx.user, result.task.repoFullName))) {
    return forbidden("You do not have access to this repository.");
  }

  let diff: DiffFile[] = [];
  let aiReview: AIReview | null = null;
  let reviewComments: ReviewComment[] = [];
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
      reviewComments = JSON.parse(result.review.commentsJson);
    } catch {
      /* ignore */
    }
  }

  return json({
    result: {
      id: result.id,
      taskId: result.taskId,
      executedBy: result.executedBy,
      reviewStatus: result.reviewStatus,
      approved: result.approved,
      commitSha: result.commitSha,
      prNumber: result.prNumber,
      prUrl: result.prUrl,
      prBranch: result.prBranch,
      createdAt: result.createdAt,
    },
    task: result.task,
    diff,
    aiReview,
    review: result.review
      ? {
          decision: result.review.decision,
          summary: result.review.summary,
          comments: reviewComments,
          createdAt: result.review.createdAt,
        }
      : null,
  });
}
