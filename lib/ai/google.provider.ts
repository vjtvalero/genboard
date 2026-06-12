import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { type LanguageModel } from "ai";
import { VercelAIProvider } from "./vercel-base.provider";
import { getApiKey } from "./secrets";
import type { Effort } from "./catalog";

// Map our effort tiers to a Gemini thinking-token budget (-1 = dynamic).
const THINKING_BUDGET: Record<string, number> = {
  low: 2048,
  medium: 8192,
  high: 24576,
  dynamic: -1,
};

/** Vercel AI SDK + Google Gemini. Effort maps to thinkingConfig.thinkingBudget. */
export class GoogleProvider extends VercelAIProvider {
  name = "google";

  constructor(
    private readonly model: string,
    private readonly effort: Effort | null,
  ) {
    super();
  }

  protected languageModel(): LanguageModel {
    const apiKey = getApiKey("google");
    if (!apiKey) {
      throw new Error(
        "No Google API key. Add one in Settings → API Keys (or set GOOGLE_GENERATIVE_AI_API_KEY), or pick another provider.",
      );
    }
    return createGoogleGenerativeAI({ apiKey })(this.model);
  }

  protected providerOptions() {
    if (!this.effort) return undefined;
    const thinkingBudget = THINKING_BUDGET[this.effort] ?? 8192;
    return { google: { thinkingConfig: { thinkingBudget } } };
  }
}
