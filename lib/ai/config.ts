import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CATALOG,
  DEFAULT_SETTINGS,
  normalizeSettings,
  type AISettings,
  type ProviderName,
} from "./catalog";

function configPath(): string {
  return path.join(os.homedir(), ".genboard", "ai-config.json");
}

/** Read the persisted AI settings, repaired against the catalog. */
export async function getAISettings(): Promise<AISettings> {
  let stored: Partial<AISettings> | undefined;
  try {
    const raw = await fs.readFile(configPath(), "utf8");
    stored = JSON.parse(raw);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
    // No file yet: seed from legacy env vars, then defaults.
    stored = {
      provider: (process.env.AI_PROVIDER as ProviderName) || DEFAULT_SETTINGS.provider,
      model: process.env.AI_CLAUDE_MODEL || DEFAULT_SETTINGS.model,
      effort: DEFAULT_SETTINGS.effort,
    };
  }
  return normalizeSettings(stored);
}

/** Persist AI settings (normalized first). */
export async function setAISettings(s: Partial<AISettings>): Promise<AISettings> {
  const normalized = normalizeSettings(s);
  await fs.mkdir(path.dirname(configPath()), { recursive: true });
  await fs.writeFile(configPath(), JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

/** Which providers are usable right now: API providers need their key; CLI providers are assumed present. */
export function availableProviders(): Record<ProviderName, boolean> {
  const out = {} as Record<ProviderName, boolean>;
  for (const spec of CATALOG) {
    out[spec.name] = spec.envKey ? !!process.env[spec.envKey] : true;
  }
  return out;
}
