// ─────────────────────────────────────────────────────────────────────────────
// Shared application types
// ─────────────────────────────────────────────────────────────────────────────

// Collaboration primitives
export type Mode = "pm" | "se";

export type UserRole = "pm" | "se" | "admin";

export type TaskStatus =
  | "backlog"
  | "running"
  | "executed"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "pr_opened"
  | "merged"
  | "pushed"
  | "failed";

export type Priority = "low" | "medium" | "high" | "urgent";

export type ReviewDecision = "approved" | "changes_requested";

export type ReviewStatus = "pending" | "approved" | "changes_requested";

/** Where a Result/ExecutionRun came from: the one-way execute flow or a task chat. */
export type ResultOrigin = "execute" | "chat";

export type ActivityKind =
  | "created"
  | "executed"
  | "ai_reviewed"
  | "approved"
  | "changes_requested"
  | "pr_opened"
  | "merged"
  | "pushed"
  | "reordered"
  | "rolled_back"
  | "failed";

// ─────────────────────────────────────────────────────────────────────────────
// AI provider layer
// ─────────────────────────────────────────────────────────────────────────────

export interface FileContext {
  path: string;
  content: string;
}

/** A single full-file replacement, with the pre-write snapshot for rollback. */
export interface FilePatch {
  path: string;
  originalContent: string;
  newContent: string;
}

export interface AIRequest {
  prompt: string;
  repoFullName: string;
  files: FileContext[];
  /** Absolute local repo path — required by "apply"-mode (agentic CLI) providers. */
  repoPath?: string;
}

export interface AIResponse {
  patches: FilePatch[];
  rawText: string;
}

export interface AIReviewRequest {
  prompt: string; // original task prompt, for context
  repoFullName: string;
  diff: DiffFile[]; // what changed
}

export interface AIReviewFinding {
  path: string;
  line?: number;
  severity: "info" | "warning" | "critical";
  message: string;
}

export interface AIReview {
  summary: string;
  findings: AIReviewFinding[];
}

/**
 * Streaming AI provider. Both methods are async generators: they `yield` raw
 * text tokens (for the SSE terminal panel) and `return` the structured result
 * once the stream completes.
 */
export interface AIProvider {
  name: string;
  /**
   * "patch" — the model returns JSON file replacements that the route applies.
   * "apply" — an agentic CLI edits the working tree itself; the route derives the
   * diff from git afterward.
   */
  mode: "patch" | "apply";
  execute(req: AIRequest): AsyncGenerator<string, AIResponse, unknown>;
  reviewDiff(req: AIReviewRequest): AsyncGenerator<string, AIReview, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Diff display
// ─────────────────────────────────────────────────────────────────────────────

export interface DiffFile {
  path: string;
  hunks: string; // unified diff string for this file
  additions: number;
  deletions: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Review UI
// ─────────────────────────────────────────────────────────────────────────────

export interface ReviewComment {
  path: string;
  line?: number;
  body: string;
}

// Client-facing task shape (serializable; dates as ISO strings).
export interface TaskCard {
  id: string;
  repoFullName: string;
  branchName: string;
  title: string;
  prompt: string;
  status: TaskStatus;
  priority: Priority;
  order: number;
  latestResultId: string | null;
  updatedAt: string;
}

// A row in the result-centric review queue (any origin).
export interface ReviewQueueItem {
  id: string; // resultId
  taskId: string;
  taskTitle: string;
  taskPrompt: string;
  repoFullName: string;
  origin: ResultOrigin;
  reviewStatus: ReviewStatus;
  additions: number;
  deletions: number;
  fileCount: number;
  prNumber: number | null;
  prUrl: string | null;
  prMerged: boolean;
  updatedAt: string;
}

// A chat message rendered in a task's chat thread.
export interface ChatMessageView {
  id: string;
  role: "user" | "assistant";
  content: string;
  resultId: string | null;
  createdAt: string;
}

export interface UserSummary {
  id: string;
  githubLogin: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// GitHub
// ─────────────────────────────────────────────────────────────────────────────

export interface RepoSummary {
  id?: string;
  fullName: string; // "owner/repo"
  name: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
  enabled?: boolean;
  membershipUserIds?: string[];
  localPath?: string;
  cloned?: boolean;
}

export interface RepoBranch {
  name: string;
  protected: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// SSE event envelope (Execute + AI review streams)
// ─────────────────────────────────────────────────────────────────────────────

export type StreamEvent =
  | { type: "token"; text: string }
  | { type: "status"; message: string }
  | { type: "done"; resultId: string }
  | { type: "review_done"; resultId: string; review: AIReview }
  | { type: "error"; message: string };
