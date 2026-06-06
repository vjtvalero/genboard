import type {
  AIProvider,
  AIRequest,
  AIResponse,
  AIReview,
  AIReviewRequest,
  FilePatch,
} from "@/types";
import {
  EXECUTE_SYSTEM,
  REVIEW_SYSTEM,
  buildExecuteUserMessage,
  buildReviewUserMessage,
} from "./prompts";
import { parseFiles, parseReview } from "./parse";
import { spawnStream } from "./spawn";

/**
 * Shells out to the local `claude` CLI in headless (`--print`) mode. Prompted to
 * return the JSON file-replacement block (patch mode), so the route applies the
 * changes — the same contract as the API providers.
 */
export class ClaudeCodeCLIProvider implements AIProvider {
  name = "claude-cli";
  readonly mode = "patch" as const;

  constructor(private readonly model: string) {}

  private args(): string[] {
    const args = ["--print"];
    if (this.model) args.push("--model", this.model);
    return args;
  }

  async *execute(req: AIRequest): AsyncGenerator<string, AIResponse, unknown> {
    const stdin = `${EXECUTE_SYSTEM}\n\n${buildExecuteUserMessage(req)}`;
    const full = yield* spawnStream("claude", this.args(), process.cwd(), stdin);

    const byPath = new Map(req.files.map((f) => [f.path, f.content]));
    const patches: FilePatch[] = parseFiles(full).map((p) => ({
      path: p.path,
      originalContent: byPath.get(p.path) ?? "",
      newContent: p.content,
    }));

    return { patches, rawText: full };
  }

  async *reviewDiff(req: AIReviewRequest): AsyncGenerator<string, AIReview, unknown> {
    const stdin = `${REVIEW_SYSTEM}\n\n${buildReviewUserMessage(req)}`;
    const full = yield* spawnStream("claude", this.args(), process.cwd(), stdin);
    return parseReview(full);
  }
}
