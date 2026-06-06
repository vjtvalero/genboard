import { promises as fs } from "node:fs";
import path from "node:path";
import { gitClient } from "./client";

export interface ValidateResult {
  ok: boolean;
  reason?: string;
  absPath?: string;
}

/** Check that a path exists and is the root of a git repository. */
export async function validateRepoPath(localPath: string): Promise<ValidateResult> {
  const absPath = path.resolve(localPath);

  let stat;
  try {
    stat = await fs.stat(absPath);
  } catch {
    return { ok: false, reason: "Path does not exist." };
  }
  if (!stat.isDirectory()) {
    return { ok: false, reason: "Path is not a directory." };
  }

  try {
    const git = gitClient(absPath);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      return { ok: false, reason: "Directory is not a git repository.", absPath };
    }
  } catch (err) {
    return {
      ok: false,
      reason: `Could not run git: ${(err as Error).message}`,
      absPath,
    };
  }

  return { ok: true, absPath };
}

/** Throwing variant used by execute/commit paths. */
export async function assertRepoPath(localPath: string): Promise<string> {
  const result = await validateRepoPath(localPath);
  if (!result.ok || !result.absPath) {
    throw new Error(result.reason ?? "Invalid repo path.");
  }
  return result.absPath;
}
