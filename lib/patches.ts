import { promises as fs } from "node:fs";
import path from "node:path";
import type { FilePatch } from "@/types";

/** Stored patch adds a `created` flag so rollback can delete new files. */
export interface StoredPatch extends FilePatch {
  created: boolean;
}

/** Resolve a repo-relative path safely, rejecting path traversal. */
export function resolveSafe(root: string, rel: string): string {
  const normalizedRoot = path.resolve(root);
  const target = path.resolve(normalizedRoot, rel);
  const withSep = normalizedRoot.endsWith(path.sep)
    ? normalizedRoot
    : normalizedRoot + path.sep;
  if (target !== normalizedRoot && !target.startsWith(withSep)) {
    throw new Error(`Path escapes repository root: ${rel}`);
  }
  return target;
}

async function readIfExists(abs: string): Promise<string | null> {
  try {
    return await fs.readFile(abs, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Apply full-file replacements to disk. Snapshots the true on-disk original of
 * each file (for rollback) before writing. Returns the stored-patch records.
 */
export async function applyPatches(
  root: string,
  patches: FilePatch[],
): Promise<StoredPatch[]> {
  const stored: StoredPatch[] = [];

  for (const patch of patches) {
    const abs = resolveSafe(root, patch.path);
    const existing = await readIfExists(abs);
    const created = existing === null;

    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, patch.newContent, "utf8");

    stored.push({
      path: patch.path,
      originalContent: existing ?? "",
      newContent: patch.newContent,
      created,
    });
  }

  return stored;
}

/** Restore originals from stored patches; deletes files that were created. */
export async function rollbackPatches(
  root: string,
  stored: StoredPatch[],
): Promise<void> {
  for (const patch of stored) {
    const abs = resolveSafe(root, patch.path);
    if (patch.created) {
      try {
        await fs.unlink(abs);
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
      }
    } else {
      await fs.writeFile(abs, patch.originalContent, "utf8");
    }
  }
}
