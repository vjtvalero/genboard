import { createAnthropic } from "@ai-sdk/anthropic";
import { type LanguageModel } from "ai";
import { VercelAIProvider } from "./vercel-base.provider";
import type { Effort } from "./catalog";

/** Vercel AI SDK + Anthropic. Effort maps to adaptive thinking + the effort param. */
export class ClaudeAPIProvider extends VercelAIProvider {
  name = "claude-api";

  constructor(
    private readonly model: string,
    private readonly effort: Effort | null,
  ) {
    super();
  }

  protected languageModel(): LanguageModel {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Add it to .env.local or pick another provider.",
      );
    }
    return createAnthropic({ apiKey })(this.model);
  }

  protected providerOptions() {
    if (!this.effort) return undefined; // e.g. Haiku — effort/adaptive unsupported
    return {
      anthropic: {
        effort: this.effort,
        thinking: { type: "adaptive" },
      },
    };
  }
}
