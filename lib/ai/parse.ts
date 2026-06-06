import type { AIReview, AIReviewFinding } from "@/types";

export interface ParsedFile {
  path: string;
  content: string;
}

/**
 * Extract the last JSON object from a model response. Prefers a fenced
 * ```json block; falls back to the last balanced `{ … }` span.
 */
export function extractJsonObject(text: string): string | null {
  // 1. Fenced ```json ... ``` (take the last one).
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  let lastFenced: string | null = null;
  while ((match = fenceRe.exec(text)) !== null) {
    lastFenced = match[1].trim();
  }
  if (lastFenced && lastFenced.startsWith("{")) return lastFenced;

  // 2. Fall back to the last balanced object in the raw text.
  const lastClose = text.lastIndexOf("}");
  if (lastClose === -1) return null;
  let depth = 0;
  for (let i = lastClose; i >= 0; i--) {
    const ch = text[i];
    if (ch === "}") depth++;
    else if (ch === "{") {
      depth--;
      if (depth === 0) return text.slice(i, lastClose + 1);
    }
  }
  return null;
}

/** Parse the `{ files: [...] }` patch block from an execute response. */
export function parseFiles(text: string): ParsedFile[] {
  const json = extractJsonObject(text);
  if (!json) return [];
  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch {
    return [];
  }
  const files = (obj as { files?: unknown })?.files;
  if (!Array.isArray(files)) return [];

  const out: ParsedFile[] = [];
  for (const f of files) {
    if (
      f &&
      typeof f === "object" &&
      typeof (f as ParsedFile).path === "string" &&
      typeof (f as ParsedFile).content === "string"
    ) {
      out.push({
        path: (f as ParsedFile).path.replace(/\\/g, "/").replace(/^\.?\//, ""),
        content: (f as ParsedFile).content,
      });
    }
  }
  return out;
}

const SEVERITIES = new Set(["info", "warning", "critical"]);

/** Parse the `{ summary, findings }` review block. */
export function parseReview(text: string): AIReview {
  const json = extractJsonObject(text);
  const fallback: AIReview = { summary: "", findings: [] };
  if (!json) return { ...fallback, summary: "(could not parse AI review output)" };

  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch {
    return { ...fallback, summary: "(could not parse AI review output)" };
  }

  const summary =
    typeof (obj as AIReview)?.summary === "string" ? (obj as AIReview).summary : "";
  const rawFindings = (obj as { findings?: unknown })?.findings;
  const findings: AIReviewFinding[] = [];

  if (Array.isArray(rawFindings)) {
    for (const f of rawFindings) {
      if (!f || typeof f !== "object") continue;
      const path = typeof (f as AIReviewFinding).path === "string" ? (f as AIReviewFinding).path : "";
      const message =
        typeof (f as AIReviewFinding).message === "string" ? (f as AIReviewFinding).message : "";
      if (!message) continue;
      const sevRaw = (f as AIReviewFinding).severity;
      const severity = (SEVERITIES.has(sevRaw) ? sevRaw : "info") as AIReviewFinding["severity"];
      const lineRaw = (f as AIReviewFinding).line;
      const line = typeof lineRaw === "number" ? lineRaw : undefined;
      findings.push({ path, line, severity, message });
    }
  }

  return { summary, findings };
}
