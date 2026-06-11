import { unauthorized, forbidden, notFound, conflict, serverError, json, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { assertWorktreePath, removeTaskWorktree } from "@/lib/workspace/config";
import { stageCommitPushBranch } from "@/lib/git/commit";
import { createPullRequest } from "@/lib/github/repos";
import { userCanAccessRepository } from "@/lib/repositories";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/results/[resultId]/approve — commit, push a PR branch, and open a PR.
export async function POST(req: Request, { params }: { params: { resultId: string } }) {
  const ctx = await requireUser();
  if (ctx instanceof Response) return ctx;
  if (!ctx.session.accessToken) return unauthorized("Missing GitHub access token");

  const result = await prisma.result.findUnique({
    where: { id: params.resultId },
    include: { task: true },
  });
  if (!result) return notFound("Result not found");
  if (!(await userCanAccessRepository(ctx.user, result.task.repoFullName))) {
    return forbidden("You do not have access to this repository.");
  }

  // HARD GATE: only an SE-approved result may be promoted to a PR.
  if (result.reviewStatus !== "approved") {
    return conflict("Result is not approved by the Senior Engineer. Approve it first.");
  }

  if (result.prUrl) {
    return json({
      ok: true,
      commitSha: result.commitSha,
      branch: result.prBranch,
      prNumber: result.prNumber,
      prUrl: result.prUrl,
    });
  }

  let body: { commitMessage?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const commitMessage =
    body.commitMessage?.trim() || `genboard: ${result.task.title}`;

  try {
    const baseBranch = result.task.branchName;
    const prBranch = result.prBranch ?? `genboard/${result.id}`;
    let commitSha = result.commitSha;
    let branch = result.prBranch;

    if (!commitSha || !branch) {
      const root = await assertWorktreePath(result.worktreePath);
      const committed = await stageCommitPushBranch(
        root,
        prBranch,
        commitMessage,
        ctx.session.accessToken,
      );
      commitSha = committed.commitSha;
      branch = committed.branch;

      await prisma.result.update({
        where: { id: result.id },
        data: { approved: true, commitSha, prBranch: branch },
      });
    }

    const pr = await createPullRequest(ctx.session.accessToken, result.task.repoFullName, {
      title: commitMessage,
      body: [
        `Genboard task: ${result.task.title}`,
        "",
        result.task.prompt,
      ].join("\n"),
      head: branch,
      base: baseBranch,
    });

    await prisma.result.update({
      where: { id: result.id },
      data: {
        approved: true,
        commitSha,
        prNumber: pr.number,
        prUrl: pr.htmlUrl,
        prBranch: branch,
        worktreePath: null,
      },
    });
    await prisma.task.update({
      where: { id: result.taskId },
      data: { status: "pr_opened" },
    });
    await logActivity(
      result.taskId,
      "pr_opened",
      "se",
      `#${pr.number} ${branch} → ${baseBranch}`,
      ctx.user.id,
    );
    await removeTaskWorktree(result.task.repoFullName, result.worktreePath).catch(() => {});

    return json({
      ok: true,
      commitSha,
      branch,
      prNumber: pr.number,
      prUrl: pr.htmlUrl,
    });
  } catch (err) {
    return serverError((err as Error).message);
  }
}
