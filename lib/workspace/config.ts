import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { validateRepoPath } from "@/lib/git/validate";

const execFileAsync = promisify(execFile);

/** Map of "owner/repo" -> absolute managed git cache path. */
export type WorkspaceMap = Record<string, string>;

function configDir(): string {
  return path.join(os.homedir(), ".genboard");
}

export function reposDir(): string {
  return path.join(configDir(), "repos");
}

export function worktreesDir(): string {
  return path.join(configDir(), "worktrees");
}

function splitRepo(repoFullName: string): [string, string] {
  const parts = repoFullName.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid repo name: ${repoFullName}`);
  }
  return [parts[0], parts[1]];
}

/** Bare mirror path under ~/.genboard/repos. */
export function mirrorPathForRepo(repoFullName: string): string {
  const [owner, repo] = splitRepo(repoFullName);
  return path.join(reposDir(), owner, `${repo}.git`);
}

/** Compatibility alias used by repo-list responses. */
export function workspacePathForRepo(repoFullName: string): string {
  return mirrorPathForRepo(repoFullName);
}

async function isBareMirror(localPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(localPath);
    if (!stat.isDirectory()) return false;
    const { stdout } = await execFileAsync("git", [
      "--git-dir",
      localPath,
      "rev-parse",
      "--is-bare-repository",
    ]);
    return String(stdout).trim() === "true";
  } catch {
    return false;
  }
}

/** Read managed mirrors that already exist locally. */
export async function readWorkspaces(): Promise<WorkspaceMap> {
  const out: WorkspaceMap = {};
  try {
    const owners = await fs.readdir(reposDir(), { withFileTypes: true });
    for (const owner of owners) {
      if (!owner.isDirectory()) continue;
      const ownerDir = path.join(reposDir(), owner.name);
      const repos = await fs.readdir(ownerDir, { withFileTypes: true });
      for (const repo of repos) {
        if (!repo.isDirectory() || !repo.name.endsWith(".git")) continue;
        const repoName = repo.name.slice(0, -4);
        const repoFullName = `${owner.name}/${repoName}`;
        const mirrorPath = path.join(ownerDir, repo.name);
        if (await isBareMirror(mirrorPath)) out[repoFullName] = mirrorPath;
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return {};
    throw err;
  }
  return out;
}

/** Look up the managed mirror path for a repo, or null if it is not cached yet. */
export async function getWorkspacePath(repoFullName: string): Promise<string | null> {
  const mirrorPath = mirrorPathForRepo(repoFullName);
  return (await isBareMirror(mirrorPath)) ? mirrorPath : null;
}

async function withGitAskpass<T>(token: string, fn: (askpassPath: string) => Promise<T>): Promise<T> {
  const askpassPath = path.join(
    os.tmpdir(),
    `genboard-git-askpass-${process.pid}-${Date.now()}.sh`,
  );
  await fs.writeFile(askpassPath, "#!/bin/sh\nprintf '%s\\n' \"$GIT_TOKEN\"\n", {
    mode: 0o700,
  });
  try {
    return await fn(askpassPath);
  } finally {
    await fs.unlink(askpassPath).catch(() => {});
  }
}

export async function runGitAuthenticated(
  cwd: string,
  args: string[],
  token: string,
): Promise<void> {
  await withGitAskpass(token, async (askpassPath) => {
    await execFileAsync("git", args, {
      cwd,
      env: {
        ...process.env,
        GIT_ASKPASS: askpassPath,
        GIT_TERMINAL_PROMPT: "0",
        GIT_TOKEN: token,
      },
      maxBuffer: 10 * 1024 * 1024,
    });
  });
}

async function setMirrorRemote(repoFullName: string, mirrorPath: string): Promise<void> {
  await execFileAsync("git", [
    "--git-dir",
    mirrorPath,
    "remote",
    "set-url",
    "origin",
    `https://x-access-token@github.com/${repoFullName}.git`,
  ]);
}

export async function ensureMirror(repoFullName: string, token: string): Promise<string> {
  const mirrorPath = mirrorPathForRepo(repoFullName);
  const cloneUrl = `https://x-access-token@github.com/${repoFullName}.git`;
  await fs.mkdir(path.dirname(mirrorPath), { recursive: true });

  if (!(await isBareMirror(mirrorPath))) {
    await runGitAuthenticated(
      path.dirname(mirrorPath),
      ["clone", "--mirror", cloneUrl, mirrorPath],
      token,
    );
  } else {
    await setMirrorRemote(repoFullName, mirrorPath);
    await runGitAuthenticated(path.dirname(mirrorPath), [
      "--git-dir",
      mirrorPath,
      "fetch",
      "origin",
      "--prune",
    ], token);
  }

  return mirrorPath;
}

export async function createTaskWorktree(
  repoFullName: string,
  branchName: string,
  taskId: string,
  token: string,
): Promise<string> {
  const mirrorPath = await ensureMirror(repoFullName, token);
  const runId = randomUUID();
  const worktreePath = path.join(worktreesDir(), taskId, runId);
  await fs.mkdir(path.dirname(worktreePath), { recursive: true });

  await execFileAsync("git", [
    "--git-dir",
    mirrorPath,
    "worktree",
    "add",
    "--detach",
    worktreePath,
    branchName,
  ]);

  const check = await validateRepoPath(worktreePath);
  if (!check.ok || !check.absPath) {
    throw new Error(check.reason ?? "Invalid worktree path");
  }
  return check.absPath;
}

export async function removeTaskWorktree(
  repoFullName: string,
  worktreePath: string | null | undefined,
): Promise<void> {
  if (!worktreePath) return;
  const mirrorPath = mirrorPathForRepo(repoFullName);
  try {
    await execFileAsync("git", [
      "--git-dir",
      mirrorPath,
      "worktree",
      "remove",
      "--force",
      worktreePath,
    ]);
  } catch {
    await fs.rm(worktreePath, { recursive: true, force: true }).catch(() => {});
  } finally {
    await execFileAsync("git", [
      "--git-dir",
      mirrorPath,
      "worktree",
      "prune",
    ]).catch(() => {});
  }
}

export async function assertWorktreePath(worktreePath: string | null | undefined): Promise<string> {
  if (!worktreePath) {
    throw new Error("This result does not have an isolated worktree. Re-execute the task.");
  }
  const check = await validateRepoPath(worktreePath);
  if (!check.ok || !check.absPath) {
    throw new Error(check.reason ?? "Invalid worktree path");
  }
  return check.absPath;
}

// Legacy no-ops kept so old clients cannot rewrite managed workspace paths.
export async function setWorkspace(): Promise<WorkspaceMap> {
  throw new Error("Genboard now manages git mirrors and worktrees under ~/.genboard.");
}

export async function removeWorkspace(): Promise<WorkspaceMap> {
  throw new Error("Genboard now manages git mirrors and worktrees under ~/.genboard.");
}
