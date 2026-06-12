import { readFileSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CATALOG, type ProviderName } from "./catalog";

// ─────────────────────────────────────────────────────────────────────────────
// API key store. Keys set in the UI are persisted (gitignored) at
// ~/.genboard/secrets.json and take precedence over the matching env var. Unlike
// env keys, stored keys are read live at run time, so changing one does NOT
// require restarting the service. Raw keys never leave the server.
// ─────────────────────────────────────────────────────────────────────────────

export type KeySource = "stored" | "env" | "none";

type SecretStore = Partial<Record<ProviderName, string>>;

function secretsPath(): string {
  return path.join(os.homedir(), ".genboard", "secrets.json");
}

function envKeyFor(provider: ProviderName): string | null {
  return CATALOG.find((c) => c.name === provider)?.envKey ?? null;
}

function readStoreSync(): SecretStore {
  try {
    return JSON.parse(readFileSync(secretsPath(), "utf8")) as SecretStore;
  } catch {
    return {};
  }
}

async function readStore(): Promise<SecretStore> {
  try {
    return JSON.parse(await fs.readFile(secretsPath(), "utf8")) as SecretStore;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
    return {};
  }
}

async function writeStore(store: SecretStore): Promise<void> {
  await fs.mkdir(path.dirname(secretsPath()), { recursive: true });
  await fs.writeFile(secretsPath(), JSON.stringify(store, null, 2), "utf8");
  await fs.chmod(secretsPath(), 0o600).catch(() => {});
}

/** Resolve the active API key for a provider: a stored key wins, else the env var. */
export function getApiKey(provider: ProviderName): string | undefined {
  const stored = readStoreSync()[provider];
  if (stored) return stored;
  const envKey = envKeyFor(provider);
  return envKey ? process.env[envKey] || undefined : undefined;
}

export function hasApiKey(provider: ProviderName): boolean {
  return !!getApiKey(provider);
}

/** Where the active key comes from — for the Settings UI. */
export function keySource(provider: ProviderName): KeySource {
  if (readStoreSync()[provider]) return "stored";
  const envKey = envKeyFor(provider);
  if (envKey && process.env[envKey]) return "env";
  return "none";
}

/** A non-secret preview of the active key (last 4 chars), or null. */
export function maskedKey(provider: ProviderName): string | null {
  const key = getApiKey(provider);
  if (!key) return null;
  const tail = key.slice(-4);
  return `••••••••${tail}`;
}

/** Persist (or, with an empty value, clear) a provider's API key. */
export async function setApiKey(provider: ProviderName, key: string): Promise<void> {
  const trimmed = key.trim();
  const store = await readStore();
  if (trimmed) store[provider] = trimmed;
  else delete store[provider];
  await writeStore(store);
}

export async function clearApiKey(provider: ProviderName): Promise<void> {
  const store = await readStore();
  delete store[provider];
  await writeStore(store);
}
