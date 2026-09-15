import { badRequest, forbidden, notFound, serverError, json, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { userCanAccessRepository } from "@/lib/repositories";
import type { ReviewComment, ReviewDecision } from "@/types";

export const dynamic = "force-dynamic";

// POST /api/results/[resultId]/review — SE verdict: approve or request changes.
export async function POST(req: Request, { params }: { params: { resultId: string } }) {
  const ctx = await requireUser();
  if (ctx instanceof Response) return ctx;

  let body: { decision?: ReviewDecision; summary?: string; comments?: ReviewComment[] };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const decision = body.decision;
  if (decision !== "approved" && decision !== "changes_requested") {
    return badRequest('decision must be "approved" or "changes_requested"');
  }
  const summary = typeof body.summary === "string" ? body.summary : "";
  const comments = Array.isArray(body.comments) ? body.comments : [];

  const result = await prisma.result.findUnique({
    where: { id: params.resultId },
    include: { task: true },
  });
  if (!result) return notFound("Result not found");
  if (!(await userCanAccessRepository(ctx.user, result.task.repoFullName))) {
    return forbidden("You do not have access to this repository.");
  }

  try {
    await prisma.review.upsert({
      where: { resultId: result.id },
      update: {
        decision,
        summary,
        commentsJson: JSON.stringify(comments),
        reviewerUserId: ctx.user.id,
      },
      create: {
        resultId: result.id,
        reviewerUserId: ctx.user.id,
        decision,
        summary,
        commentsJson: JSON.stringify(comments),
      },
    });

    await prisma.result.update({
      where: { id: result.id },
      data: { reviewStatus: decision },
    });

    // Mirror the verdict onto the board task only for the one-way execute flow.
    // Chat-origin results live entirely in the result-centric review queue and must
    // not force the parent task's status (a task can hold both flows at once).
    const newStatus = decision === "approved" ? "approved" : "changes_requested";
    if (result.origin === "execute") {
      await prisma.task
        .update({ where: { id: result.taskId }, data: { status: newStatus } })
        .catch(() => {});
    }

    await logActivity(
      result.taskId,
      decision === "approved" ? "approved" : "changes_requested",
      "se",
      summary || (decision === "approved" ? "Approved" : "Changes requested"),
      ctx.user.id,
    );

    return json({
      ok: true,
      reviewStatus: decision,
      taskStatus: result.origin === "execute" ? newStatus : undefined,
    });
  } catch (err) {
    return serverError((err as Error).message);
  }
}
