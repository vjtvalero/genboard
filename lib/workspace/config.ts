import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

/** Map of "owner/repo" → absolute local path. */
export type WorkspaceMap = Record<string, string>;

function configDir(): string {
  return path.join(os.homedir(), ".genboard");
}

function configPath(): string {
  return path.join(configDir(), "workspaces.json");
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(configDir(), { recursive: true });
}

/** Read the workspace map; returns {} if the file doesn't exist yet. */
export async function readWorkspaces(): Promise<WorkspaceMap> {
  try {
    const raw = await fs.readFile(configPath(), "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as WorkspaceMap;
    return {};
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return {};
    throw err;
  }
}

async function writeWorkspaces(map: WorkspaceMap): Promise<void> {
  await ensureDir();
  await fs.writeFile(configPath(), JSON.stringify(map, null, 2), "utf8");
}

/** Look up the local path for a repo, or null if unlinked. */
export async function getWorkspacePath(repoFullName: string): Promise<string | null> {
  const map = await readWorkspaces();
  return map[repoFullName] ?? null;
}

/** Link a repo to a local path. */
export async function setWorkspace(repoFullName: string, localPath: string): Promise<WorkspaceMap> {
  const map = await readWorkspaces();
  map[repoFullName] = path.resolve(localPath);
  await writeWorkspaces(map);
  return map;
}

/** Remove a repo → path mapping. */
export async function removeWorkspace(repoFullName: string): Promise<WorkspaceMap> {
  const map = await readWorkspaces();
  delete map[repoFullName];
  await writeWorkspaces(map);
  return map;
}
