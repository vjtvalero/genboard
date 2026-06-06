import { promises as fs } from "node:fs";
import path from "node:path";
import { glob } from "glob";
import ignore from "ignore";
import type { FileContext } from "@/types";

const DEFAULTS = {
  maxFiles: Number(process.env.GENBOARD_MAX_FILES ?? 400),
  maxFileBytes: Number(process.env.GENBOARD_MAX_FILE_BYTES ?? 100_000),
  maxTotalBytes: Number(process.env.GENBOARD_MAX_TOTAL_BYTES ?? 2_000_000),
};

// Directories we never want to enumerate, even if not in .gitignore.
const HARD_EXCLUDES = [
  "**/node_modules/**",
  "**/.git/**",
  "**/.next/**",
  "**/dist/**",
  "**/build/**",
  "**/.turbo/**",
  "**/coverage/**",
];

// Binary-ish extensions to skip.
const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".tiff",
  ".pdf", ".zip", ".gz", ".tar", ".rar", ".7z",
  ".mp3", ".mp4", ".mov", ".avi", ".webm", ".wav", ".ogg",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".exe", ".dll", ".so", ".dylib", ".bin", ".class", ".jar",
  ".db", ".sqlite", ".lock",
]);

const NUL = String.fromCharCode(0);

async function loadGitignore(root: string): Promise<ReturnType<typeof ignore>> {
  const ig = ignore();
  try {
    const content = await fs.readFile(path.join(root, ".gitignore"), "utf8");
    ig.add(content);
  } catch {
    // no .gitignore — fine
  }
  return ig;
}

/**
 * Enumerate text files in a repo for AI context: glob -> .gitignore filter ->
 * binary/size/count limits. Returns relative POSIX paths with contents.
 */
export async function readRepoFiles(
  root: string,
  opts: Partial<typeof DEFAULTS> = {},
): Promise<{ files: FileContext[]; truncated: boolean }> {
  const limits = { ...DEFAULTS, ...opts };
  const ig = await loadGitignore(root);

  const matches = await glob("**/*", {
    cwd: root,
    nodir: true,
    dot: false,
    ignore: HARD_EXCLUDES,
    absolute: false,
    posix: true,
  });

  // Apply .gitignore and stable ordering.
  const candidates = matches
    .filter((rel) => !ig.ignores(rel))
    .filter((rel) => !BINARY_EXT.has(path.extname(rel).toLowerCase()))
    .sort();

  const files: FileContext[] = [];
  let totalBytes = 0;
  let truncated = false;

  for (const rel of candidates) {
    if (files.length >= limits.maxFiles) {
      truncated = true;
      break;
    }
    const abs = path.join(root, rel);
    let stat;
    try {
      stat = await fs.stat(abs);
    } catch {
      continue;
    }
    if (stat.size > limits.maxFileBytes) {
      truncated = true;
      continue;
    }
    if (totalBytes + stat.size > limits.maxTotalBytes) {
      truncated = true;
      break;
    }
    let content: string;
    try {
      content = await fs.readFile(abs, "utf8");
    } catch {
      continue;
    }
    // Skip files that look binary (contain NUL bytes).
    if (content.includes(NUL)) continue;

    files.push({ path: rel, content });
    totalBytes += stat.size;
  }

  return { files, truncated };
}
