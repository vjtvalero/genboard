import { getSession, unauthorized, badRequest, notFound, conflict, serverError, json } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getMode } from "@/lib/mode";
import { logActivity } from "@/lib/activity";
import { getWorkspacePath } from "@/lib/workspace/config";
import { assertRepoPath } from "@/lib/git/validate";
import { stageCommitPush } from "@/lib/git/commit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/results/[resultId]/approve — commit + push. Gated on SE approval.
export async function POST(req: Request, { params }: { params: { resultId: string } }) {
  const session = await getSession();
  if (!session) return unauthorized();

  const result = await prisma.result.findUnique({
    where: { id: params.resultId },
    include: { task: true },
  });
  if (!result) return notFound("Result not found");

  // HARD GATE: only an SE-approved result may be pushed.
  if (result.reviewStatus !== "approved") {
    return conflict("Result is not approved by the Senior Engineer. Approve it first.");
  }

  let body: { commitMessage?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const commitMessage =
    body.commitMessage?.trim() || `genboard: ${result.task.title}`;

  const localPath = await getWorkspacePath(result.task.repoFullName);
  if (!localPath) {
    return badRequest(`No local workspace linked for ${result.task.repoFullName}.`);
  }

  try {
    const root = await assertRepoPath(localPath);
    const { commitSha, branch } = await stageCommitPush(root, commitMessage);

    await prisma.result.update({
      where: { id: result.id },
      data: { approved: true, commitSha },
    });
    await prisma.task.update({
      where: { id: result.taskId },
      data: { status: "pushed" },
    });
    await logActivity(
      result.taskId,
      "pushed",
      getMode(),
      `${commitSha.slice(0, 7)} → ${branch}`,
    );

    const [owner, repo] = result.task.repoFullName.split("/");
    return json({
      ok: true,
      commitSha,
      branch,
      commitUrl: `https://github.com/${owner}/${repo}/commit/${commitSha}`,
    });
  } catch (err) {
    return serverError((err as Error).message);
  }
}
