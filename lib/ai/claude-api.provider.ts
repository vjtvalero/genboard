import { createAnthropic } from "@ai-sdk/anthropic";
import { type LanguageModel } from "ai";
import { VercelAIProvider } from "./vercel-base.provider";
import { getApiKey } from "./secrets";
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
    const apiKey = getApiKey("claude-api");
    if (!apiKey) {
      throw new Error(
        "No Anthropic API key. Add one in Settings → API Keys (or set ANTHROPIC_API_KEY), or pick another provider.",
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
