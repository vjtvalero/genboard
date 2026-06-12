import { createOpenAI } from "@ai-sdk/openai";
import { type LanguageModel } from "ai";
import { VercelAIProvider } from "./vercel-base.provider";
import { getApiKey } from "./secrets";
import type { Effort } from "./catalog";

/** Vercel AI SDK + OpenAI. Effort maps to reasoningEffort on reasoning models. */
export class OpenAIProvider extends VercelAIProvider {
  name = "openai";

  constructor(
    private readonly model: string,
    private readonly effort: Effort | null,
  ) {
    super();
  }

  protected languageModel(): LanguageModel {
    const apiKey = getApiKey("openai");
    if (!apiKey) {
      throw new Error(
        "No OpenAI API key. Add one in Settings → API Keys (or set OPENAI_API_KEY), or pick another provider.",
      );
    }
    return createOpenAI({ apiKey })(this.model);
  }

  protected providerOptions() {
    if (!this.effort) return undefined; // non-reasoning models (e.g. gpt-4o)
    return { openai: { reasoningEffort: this.effort } };
  }
}
