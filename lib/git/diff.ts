import { promises as fs } from "node:fs";
import { structuredPatch } from "diff";
import { gitClient } from "./client";
import { resolveSafe } from "@/lib/patches";
import type { DiffFile, FilePatch } from "@/types";

/**
 * Build a clean git-style unified diff string for one file from its before/after
 * content. Produces output that `react-diff-view`'s parser accepts.
 */
function formatGitDiff(
  path: string,
  oldStr: string,
  newStr: string,
): { hunks: string; additions: number; deletions: number } {
  const sp = structuredPatch(path, path, oldStr, newStr, "", "", { context: 3 });

  const created = oldStr === "";
  const lines: string[] = [];
  lines.push(`diff --git a/${path} b/${path}`);
  lines.push(`--- ${created ? "/dev/null" : `a/${path}`}`);
  lines.push(`+++ b/${path}`);

  let additions = 0;
  let deletions = 0;

  for (const hunk of sp.hunks) {
    lines.push(
      `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    );
    for (const line of hunk.lines) {
      if (line.startsWith("+")) additions++;
      else if (line.startsWith("-")) deletions++;
      lines.push(line);
    }
  }

  return { hunks: lines.join("\n") + "\n", additions, deletions };
}

/**
 * Build display-ready DiffFile[] from full-file patches using the `diff`
 * package (decision #2: we diff original vs. new ourselves rather than relying
 * on git patch application).
 */
export function diffFromPatches(patches: FilePatch[]): DiffFile[] {
  const out: DiffFile[] = [];
  for (const patch of patches) {
    const oldStr = patch.originalContent ?? "";
    const newStr = patch.newContent ?? "";
    if (oldStr === newStr) continue;
    const { hunks, additions, deletions } = formatGitDiff(patch.path, oldStr, newStr);
    out.push({ path: patch.path, hunks, additions, deletions });
  }
  return out;
}

/** Raw `git diff` of the working tree (used for ad-hoc inspection). */
export async function getWorkingDiff(repoPath: string): Promise<string> {
  const git = gitClient(repoPath);
  return git.diff();
}

/**
 * Build FilePatch[] for every file that differs between the working tree and
 * `base` (a commit-ish). Used to derive the patch set after an agentic CLI edits
 * the tree, and to compute the *cumulative* diff of a multi-turn chat worktree
 * against the branch tip it was created at.
 *
 * NOTE: deleted/binary files are skipped (v1 limitation) — additions and
 * modifications are captured.
 */
export async function patchesFromWorktreeVsBase(
  root: string,
  base: string,
): Promise<FilePatch[]> {
  const git = gitClient(root);
  const status = await git.status();
  const paths = new Set<string>();
  for (const f of status.files) {
    // simple-git may report renames as "old -> new"; take the new path.
    const p = f.path.includes(" -> ") ? f.path.split(" -> ")[1] : f.path;
    paths.add(p.trim());
  }

  const patches: FilePatch[] = [];
  for (const rel of paths) {
    const abs = resolveSafe(root, rel);
    let newContent: string;
    try {
      newContent = await fs.readFile(abs, "utf8");
    } catch {
      continue; // deleted or unreadable (binary) — skip
    }

    let originalContent = "";
    if (base) {
      try {
        originalContent = await git.show([`${base}:${rel}`]);
      } catch {
        originalContent = ""; // new file
      }
    }
    if (originalContent === newContent) continue;

    patches.push({ path: rel.replace(/\\/g, "/"), originalContent, newContent });
  }
  return patches;
}
