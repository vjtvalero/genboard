import { getApiKey } from "./secrets";
import type { ProviderName } from "./catalog";

// ─────────────────────────────────────────────────────────────────────────────
// API key validation. Each provider exposes an auth-gated "list models" endpoint
// that runs no inference, so a check costs zero tokens — it only confirms the key
// is accepted. Used by the Settings "Test" button to catch typos / revoked keys
// before a run rather than at exec time.
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  ok: boolean;
  status?: number;
  message: string;
}

function modelsRequest(provider: ProviderName, key: string, signal: AbortSignal): Promise<Response> {
  switch (provider) {
    case "claude-api":
      return fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
        signal,
      });
    case "openai":
      return fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
        signal,
      });
    case "google":
      return fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
        { signal },
      );
    default:
      throw new Error(`Provider ${provider} has no API validation`);
  }
}

async function errorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string }; message?: string };
    return body?.error?.message ?? body?.message ?? "";
  } catch {
    return "";
  }
}

/**
 * Validate a provider's API key by listing its models. Tests `explicitKey` when
 * given (so a draft can be checked before saving), otherwise the stored/env key.
 */
export async function validateApiKey(
  provider: ProviderName,
  explicitKey?: string,
): Promise<ValidationResult> {
  const key = explicitKey?.trim() || getApiKey(provider);
  if (!key) return { ok: false, message: "No API key to test." };

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await modelsRequest(provider, key, ctrl.signal);
    if (res.ok) return { ok: true, status: res.status, message: "Key is valid." };
    const detail = await errorDetail(res);
    return { ok: false, status: res.status, message: detail || `HTTP ${res.status}` };
  } catch (e) {
    const err = e as Error;
    const message = err.name === "AbortError" ? "Request timed out." : `Request failed: ${err.message}`;
    return { ok: false, message };
  } finally {
    clearTimeout(timeout);
  }
}
