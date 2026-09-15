import type {
  AIProvider,
  AIRequest,
  AIResponse,
  AIReview,
  AIReviewRequest,
} from "@/types";
import { gitClient } from "@/lib/git/client";
import { patchesFromWorktreeVsBase } from "@/lib/git/diff";
import { REVIEW_SYSTEM, buildReviewUserMessage } from "./prompts";
import { parseReview } from "./parse";
import { spawnStream } from "./spawn";

export interface CLIInvocation {
  cmd: string;
  args: string[];
  /** Prompt delivered via stdin (keeps untrusted data off the shell command line). */
  stdin: string;
}

/**
 * Base for agentic coding CLIs (Codex, Antigravity) that edit the working tree
 * themselves ("apply" mode). We snapshot the git state before the run, stream
 * the CLI's output, then derive the patch set from the working-tree diff so the
 * existing Result/diff/rollback machinery still works.
 */
export abstract class AgenticCLIProvider implements AIProvider {
  abstract name: string;
  readonly mode = "apply" as const;

  /** How to run the agent on a task prompt (cwd = repo root). */
  protected abstract executeInvocation(prompt: string): CLIInvocation;
  /** How to run a read-only review that prints a JSON review block. */
  protected abstract reviewInvocation(prompt: string): CLIInvocation;

  async *execute(req: AIRequest): AsyncGenerator<string, AIResponse, unknown> {
    const root = req.repoPath;
    if (!root) {
      throw new Error(`${this.name} requires a prepared local repository path.`);
    }
    const git = gitClient(root);

    // Snapshot the pre-run tree as a commit object (works even if already dirty).
    let base = "";
    try {
      base = (await git.raw(["stash", "create"])).trim();
    } catch {
      /* ignore */
    }
    if (!base) {
      try {
        base = (await git.revparse(["HEAD"])).trim();
      } catch {
        base = "";
      }
    }

    const { cmd, args, stdin } = this.executeInvocation(req.prompt);
    let full = "";
    let runError: Error | null = null;
    try {
      full = yield* spawnStream(cmd, args, root, stdin);
    } catch (err) {
      // The agent may have partially edited the tree before failing; capture what
      // changed and only surface the error if nothing did.
      runError = err as Error;
    }

    const patches = await patchesFromWorktreeVsBase(root, base);
    if (patches.length === 0 && runError) throw runError;

    return {
      patches,
      rawText: runError ? `${full}\n[${runError.message}]` : full,
    };
  }

  async *reviewDiff(req: AIReviewRequest): AsyncGenerator<string, AIReview, unknown> {
    const { cmd, args, stdin } = this.reviewInvocation(buildReviewUserMessage(req));
    const full = yield* spawnStream(cmd, args, process.cwd(), stdin);
    return parseReview(full);
  }

  // Helper for subclasses that share the review system prompt.
  protected reviewStdin(prompt: string): string {
    return `${REVIEW_SYSTEM}\n\n${prompt}`;
  }
}
