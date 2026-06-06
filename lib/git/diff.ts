import { structuredPatch } from "diff";
import { gitClient } from "./client";
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
