import { streamText, type LanguageModel, type JSONValue } from "ai";
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

type ProviderOptions = Record<string, Record<string, JSONValue>>;

/**
 * Shared streaming logic for all Vercel-AI-SDK providers (Anthropic, OpenAI,
 * Google). Subclasses supply the model instance and any reasoning/effort
 * `providerOptions`. These are "patch"-mode providers: the model returns a JSON
 * file-replacement block which the route applies.
 */
export abstract class VercelAIProvider implements AIProvider {
  abstract name: string;
  readonly mode = "patch" as const;

  protected abstract languageModel(): LanguageModel;
  protected providerOptions(): ProviderOptions | undefined {
    return undefined;
  }

  async *execute(req: AIRequest): AsyncGenerator<string, AIResponse, unknown> {
    const result = streamText({
      model: this.languageModel(),
      system: EXECUTE_SYSTEM,
      prompt: buildExecuteUserMessage(req),
      maxOutputTokens: 16_000,
      providerOptions: this.providerOptions(),
    });

    let full = "";
    for await (const delta of result.textStream) {
      full += delta;
      yield delta;
    }

    const byPath = new Map(req.files.map((f) => [f.path, f.content]));
    const patches: FilePatch[] = parseFiles(full).map((p) => ({
      path: p.path,
      originalContent: byPath.get(p.path) ?? "",
      newContent: p.content,
    }));

    return { patches, rawText: full };
  }

  async *reviewDiff(req: AIReviewRequest): AsyncGenerator<string, AIReview, unknown> {
    const result = streamText({
      model: this.languageModel(),
      system: REVIEW_SYSTEM,
      prompt: buildReviewUserMessage(req),
      maxOutputTokens: 8_000,
      providerOptions: this.providerOptions(),
    });

    let full = "";
    for await (const delta of result.textStream) {
      full += delta;
      yield delta;
    }

    return parseReview(full);
  }
}
