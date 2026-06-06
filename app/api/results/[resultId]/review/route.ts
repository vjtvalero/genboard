import { getSession, unauthorized, badRequest, notFound, serverError, json } from "@/lib/api";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import type { ReviewComment, ReviewDecision } from "@/types";

export const dynamic = "force-dynamic";

// POST /api/results/[resultId]/review — SE verdict: approve or request changes.
export async function POST(req: Request, { params }: { params: { resultId: string } }) {
  const session = await getSession();
  if (!session) return unauthorized();

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

  try {
    await prisma.review.upsert({
      where: { resultId: result.id },
      update: { decision, summary, commentsJson: JSON.stringify(comments) },
      create: {
        resultId: result.id,
        decision,
        summary,
        commentsJson: JSON.stringify(comments),
      },
    });

    await prisma.result.update({
      where: { id: result.id },
      data: { reviewStatus: decision },
    });

    const newStatus = decision === "approved" ? "approved" : "changes_requested";
    await prisma.task.update({
      where: { id: result.taskId },
      data: { status: newStatus },
    });

    await logActivity(
      result.taskId,
      decision === "approved" ? "approved" : "changes_requested",
      "se",
      summary || (decision === "approved" ? "Approved" : "Changes requested"),
    );

    return json({ ok: true, reviewStatus: decision, taskStatus: newStatus });
  } catch (err) {
    return serverError((err as Error).message);
  }
}
