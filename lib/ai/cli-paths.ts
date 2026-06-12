import { readFileSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// CLI path overrides. A path pinned in the UI is persisted (gitignored) at
// ~/.genboard/cli-paths.json, keyed by command name (e.g. "claude"), and takes
// precedence over the `<CMD>_BIN` env var and PATH auto-detection. Unlike env,
// it takes effect live — no service restart. These are locations, not secrets.
// ─────────────────────────────────────────────────────────────────────────────

type PathStore = Record<string, string>;

function storePath(): string {
  return path.join(os.homedir(), ".genboard", "cli-paths.json");
}

function readStoreSync(): PathStore {
  try {
    return JSON.parse(readFileSync(storePath(), "utf8")) as PathStore;
  } catch {
    return {};
  }
}

async function readStore(): Promise<PathStore> {
  try {
    return JSON.parse(await fs.readFile(storePath(), "utf8")) as PathStore;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
    return {};
  }
}

async function writeStore(store: PathStore): Promise<void> {
  await fs.mkdir(path.dirname(storePath()), { recursive: true });
  await fs.writeFile(storePath(), JSON.stringify(store, null, 2), "utf8");
}

/** The pinned path/name for a CLI command, or undefined. */
export function getCliPathOverride(cmd: string): string | undefined {
  return readStoreSync()[cmd] || undefined;
}

/** Persist (or, with an empty value, clear) a CLI command's path override. */
export async function setCliPath(cmd: string, value: string): Promise<void> {
  const trimmed = value.trim();
  const store = await readStore();
  if (trimmed) store[cmd] = trimmed;
  else delete store[cmd];
  await writeStore(store);
}

export async function clearCliPath(cmd: string): Promise<void> {
  const store = await readStore();
  delete store[cmd];
  await writeStore(store);
}
