import type { AIProvider } from "@/types";
import type { AISettings } from "./catalog";
import { normalizeSettings } from "./catalog";
import { getAISettings } from "./config";
import { ClaudeAPIProvider } from "./claude-api.provider";
import { OpenAIProvider } from "./openai.provider";
import { GoogleProvider } from "./google.provider";
import { ClaudeCodeCLIProvider } from "./claude-cli.provider";
import { CodexCLIProvider } from "./codex.provider";
import { AntigravityCLIProvider } from "./agy.provider";
import { CursorCLIProvider } from "./cursor-cli.provider";

/** Construct an AIProvider from explicit settings (already validated/normalized). */
export function providerFromSettings(settings: AISettings): AIProvider {
  const { provider, model, effort } = settings;
  switch (provider) {
    case "claude-api":
      return new ClaudeAPIProvider(model, effort);
    case "openai":
      return new OpenAIProvider(model, effort);
    case "google":
      return new GoogleProvider(model, effort);
    case "claude-cli":
      return new ClaudeCodeCLIProvider(model);
    case "codex":
      return new CodexCLIProvider(model, effort);
    case "agy":
      return new AntigravityCLIProvider();
    case "cursor-cli":
      return new CursorCLIProvider(model);
    default:
      throw new Error(`Unknown AI provider "${provider}".`);
  }
}

/**
 * Resolve the active AIProvider. Pass settings to override; otherwise reads the
 * persisted `~/.genboard/ai-config.json` default.
 */
export async function getProvider(settings?: AISettings): Promise<AIProvider> {
  const resolved = settings ? normalizeSettings(settings) : await getAISettings();
  return providerFromSettings(resolved);
}
