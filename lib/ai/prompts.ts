import type { ActivityKind, AIRequest, AIReviewRequest } from "@/types";
import { ACTIVITY_LABEL } from "@/lib/labels";

const MAX_PROMPT_FILE_CHARS = 16_000;

/** System prompt for code execution: full-file replacements as JSON. */
export const EXECUTE_SYSTEM = `You are a senior software engineer working inside an existing repository.

You will be given the user's task and the current contents of the repository's files.
Think through the change briefly, then implement it.

OUTPUT CONTRACT (strict):
- After your reasoning, output exactly ONE fenced code block tagged \`json\`.
- That block must contain a single JSON object of the form:
  {"files":[{"path":"relative/posix/path","content":"<ENTIRE new file content>"}]}
- "content" is the COMPLETE new content of the file, not a diff or a snippet.
- Only include files you are creating or modifying. Do not include unchanged files.
- Paths are relative to the repository root, using forward slashes.
- Do not delete files. Do not include any prose after the JSON block.
- If no change is needed, return {"files":[]}.`;

/** System prompt for SE diff review: structured findings as JSON. */
export const REVIEW_SYSTEM = `You are a meticulous senior engineer reviewing a code change (a unified diff).

Assess correctness, security, edge cases, and adherence to the stated task.
Be concrete and reference specific files/lines.

OUTPUT CONTRACT (strict):
- After any brief reasoning, output exactly ONE fenced code block tagged \`json\`.
- That block must contain a single JSON object of the form:
  {"summary":"one-paragraph overall assessment",
   "findings":[{"path":"file","line":<number-or-omitted>,"severity":"info|warning|critical","message":"..."}]}
- "severity" is one of "info", "warning", "critical".
- If the change looks good, return findings: [] with a positive summary.
- Do not include any prose after the JSON block.`;

function truncate(content: string): string {
  if (content.length <= MAX_PROMPT_FILE_CHARS) return content;
  return content.slice(0, MAX_PROMPT_FILE_CHARS) + "\n… [truncated]";
}

/** Build the user message for an execute request. */
export function buildExecuteUserMessage(req: AIRequest): string {
  const fileBlocks = req.files
    .map((f) => `--- FILE: ${f.path} ---\n${truncate(f.content)}`)
    .join("\n\n");

  return [
    `Repository: ${req.repoFullName}`,
    "",
    "TASK:",
    req.prompt,
    "",
    "CURRENT REPOSITORY FILES:",
    fileBlocks || "(repository is empty)",
  ].join("\n");
}

export interface ChatTurn {
  role: string; // "user" | "assistant"
  content: string;
}

export interface ActivityLine {
  kind: string;
  actorMode: string;
  detail: string;
  createdAt: Date | string;
}

function formatActivity(activity: ActivityLine[]): string {
  return activity
    .map((e) => {
      const when = new Date(e.createdAt).toISOString().replace("T", " ").slice(0, 16);
      const label = ACTIVITY_LABEL[e.kind as ActivityKind] ?? e.kind;
      const who = e.actorMode ? e.actorMode.toUpperCase() : "system";
      return `- [${when}] ${who} ${label}${e.detail ? `: ${e.detail}` : ""}`;
    })
    .join("\n");
}

/**
 * Build the prompt for one agentic chat turn: task context, the task's activity
 * history (what has already happened — runs, reviews, PRs), and the running
 * conversation. The model should reply conversationally and, when warranted,
 * edit files in the working tree (which the runner turns into a diff).
 */
export function buildChatUserMessage(
  history: ChatTurn[],
  task: { title: string; prompt: string; repoFullName: string },
  activity: ActivityLine[] = [],
): string {
  const convo = history
    .map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.content}`)
    .join("\n\n");

  return [
    `You are pair-programming with a user in a chat about a task in repository ${task.repoFullName}.`,
    `Task: ${task.title}`,
    task.prompt ? `Task description:\n${task.prompt}` : "",
    "",
    "Reply to the latest user message. When code changes are warranted, edit the files in the working tree to implement them; otherwise just answer conversationally.",
    "",
    "TASK ACTIVITY SO FAR (what has already happened on this task):",
    activity.length ? formatActivity(activity) : "(no activity yet)",
    "",
    "CONVERSATION SO FAR:",
    convo || "(no messages yet)",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Build the user message for a review request. */
export function buildReviewUserMessage(req: AIReviewRequest): string {
  const diffBlocks = req.diff
    .map((d) => `--- DIFF: ${d.path} (+${d.additions} -${d.deletions}) ---\n${d.hunks}`)
    .join("\n\n");

  return [
    `Repository: ${req.repoFullName}`,
    "",
    "ORIGINAL TASK (for context):",
    req.prompt,
    "",
    "PROPOSED CHANGE (unified diff):",
    diffBlocks || "(no changes)",
  ].join("\n");
}
