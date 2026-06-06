import { gitClient } from "./client";

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
    await git.push("origin", branch);
    pushed = true;
  } catch (err) {
    // Surface push failures but keep the local commit.
    throw new Error(
      `Committed locally (${commitSha.slice(0, 7)}) but push failed: ${(err as Error).message}`,
    );
  }

  return { commitSha, pushed, branch };
}
