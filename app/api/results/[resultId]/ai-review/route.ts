import { getSession, unauthorized, notFound } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getMode } from "@/lib/mode";
import { logActivity } from "@/lib/activity";
import { getProvider } from "@/lib/ai/registry";
import { sseResponse } from "@/lib/sse";
import type { AIReviewRequest, DiffFile, StreamEvent } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/results/[resultId]/ai-review — SSE stream the AI critique; cache it.
export async function POST(_req: Request, { params }: { params: { resultId: string } }) {
  const session = await getSession();
  if (!session) return unauthorized();

  const result = await prisma.result.findUnique({
    where: { id: params.resultId },
    include: { task: true },
  });
  if (!result) return notFound("Result not found");

  let diff: DiffFile[] = [];
  try {
    diff = JSON.parse(result.diffJson);
  } catch {
    /* ignore */
  }

  async function* run(): AsyncGenerator<StreamEvent, void, unknown> {
    try {
      yield { type: "status", message: "Running AI diff review…" };

      const req: AIReviewRequest = {
        prompt: result!.task.prompt,
        repoFullName: result!.task.repoFullName,
        diff,
      };

      const provider = await getProvider();
      const gen = provider.reviewDiff(req);
      let step = await gen.next();
      while (!step.done) {
        yield { type: "token", text: step.value };
        step = await gen.next();
      }
      const review = step.value;

      await prisma.result.update({
        where: { id: result!.id },
        data: { aiReviewJson: JSON.stringify(review) },
      });
      await logActivity(
        result!.taskId,
        "ai_reviewed",
        getMode(),
        `${review.findings.length} finding(s)`,
      );

      yield { type: "review_done", resultId: result!.id, review };
    } catch (err) {
      yield { type: "error", message: (err as Error).message };
    }
  }

  return sseResponse(run());
}
