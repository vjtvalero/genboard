import { gitClient } from "./client";
import { runGitAuthenticated } from "@/lib/workspace/config";

export interface CommitResult {
  commitSha: string;
  pushed: boolean;
  branch: string;
}

/**
 * Stage all changes, commit with the given message, and push to origin on the
 * current branch. Returns the new commit SHA.
 */
export async function stageCommitPush(
  repoPath: string,
  message: string,
  token?: string,
): Promise<CommitResult> {
  const git = gitClient(repoPath);

  const status = await git.status();
  if (status.files.length === 0) {
    throw new Error("Nothing to commit — working tree is clean.");
  }

  await git.add(["-A"]);
  await git.commit(message);

  const branchSummary = await git.branch();
  const branch = branchSummary.current;

  const commitSha = (await git.revparse(["HEAD"])).trim();

  let pushed = false;
  try {
    if (token) {
      await runGitAuthenticated(repoPath, ["push", "origin", branch], token);
    } else {
      await git.push("origin", branch);
    }
    pushed = true;
  } catch (err) {
    // Surface push failures but keep the local commit.
    throw new Error(
      `Committed locally (${commitSha.slice(0, 7)}) but push failed: ${(err as Error).message}`,
    );
  }

  return { commitSha, pushed, branch };
}

/**
 * Move the pending working-tree changes onto a generated branch, commit them,
 * and push that branch to origin. The caller is responsible for opening a PR.
 */
export async function stageCommitPushBranch(
  repoPath: string,
  branch: string,
  message: string,
  token: string,
): Promise<CommitResult> {
  const git = gitClient(repoPath);

  const status = await git.status();
  if (status.files.length === 0) {
    throw new Error("Nothing to commit — working tree is clean.");
  }

  await git.checkout(["-B", branch]);
  await git.add(["-A"]);
  await git.commit(message);

  const commitSha = (await git.revparse(["HEAD"])).trim();

  try {
    await runGitAuthenticated(
      repoPath,
      ["push", "--set-upstream", "origin", branch],
      token,
    );
  } catch (err) {
    throw new Error(
      `Committed locally (${commitSha.slice(0, 7)}) but push failed: ${(err as Error).message}`,
    );
  }

  return { commitSha, pushed: true, branch };
}
