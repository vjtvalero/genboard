// ─────────────────────────────────────────────────────────────────────────────
// Dynamic model discovery. Sources the live model list (and per-model effort
// tiers) so the switcher stays current without code changes:
//   • models.dev — a public registry covering Anthropic/OpenAI/Google. One
//     key-free fetch feeds claude-api, claude-cli (borrows Anthropic), openai,
//     codex (borrows OpenAI), and google.
//   • cursor-cli — `agent models`, the only CLI here that emits machine-readable
//     model ids.
// `agy` is intentionally absent: its `agy models` lists only spaced display
// labels with no selectable ids, so it keeps its single static catalog entry.
// All results feed model-cache.ts, which adds caching + stale-while-revalidate.
// ─────────────────────────────────────────────────────────────────────────────

import type { Effort, ModelSpec, ProviderName } from "./catalog";
import { captureCli } from "./spawn";

const REGISTRY_URL = "https://models.dev/api.json";
const FETCH_TIMEOUT_MS = 12_000;

const EFFORT_SET = new Set<Effort>([
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "dynamic",
]);

// Google exposes a `budget_tokens` reasoning option rather than an effort enum;
// the google provider maps these tiers onto a thinking budget, so we surface them
// explicitly instead of deriving from the registry.
const GOOGLE_THINKING: Effort[] = ["low", "medium", "high", "dynamic"];

// models.dev provider id → the genboard providers that draw from its model list.
const REGISTRY_SOURCE: Record<string, ProviderName[]> = {
  anthropic: ["claude-api", "claude-cli"],
  openai: ["openai", "codex"],
  google: ["google"],
};

// Non-conversational models we never want in the switcher.
const EXCLUDE_RE =
  /embedding|image|tts|audio|whisper|dall|moderation|realtime|transcribe|deep-research|guard|sora|video|speech/i;

// Dated snapshot aliases (e.g. `claude-opus-4-5-20251101`, `gpt-4o-2024-05-13`).
// The undated canonical id is kept; the pinned snapshot is dropped as noise.
const SNAPSHOT_RE = /-(\d{8}|\d{4}-\d{2}-\d{2})$/;

interface RegistryModel {
  id: string;
  name?: string;
  family?: string;
  reasoning?: boolean;
  reasoning_options?: { type: string; values?: string[] }[];
  tool_call?: boolean;
  release_date?: string;
  modalities?: { input?: string[]; output?: string[] };
}

function deriveEfforts(provider: ProviderName, m: RegistryModel): Effort[] {
  if (provider === "google") return m.reasoning ? [...GOOGLE_THINKING] : [];
  const opt = m.reasoning_options?.find((o) => o.type === "effort");
  if (!opt?.values) return [];
  return opt.values.filter((v): v is Effort => EFFORT_SET.has(v as Effort));
}

function includeModel(m: RegistryModel): boolean {
  if (!m.id || EXCLUDE_RE.test(m.id) || SNAPSHOT_RE.test(m.id)) return false;
  if (m.family && EXCLUDE_RE.test(m.family)) return false;
  const out = m.modalities?.output;
  if (out && !out.includes("text")) return false;
  // Coding workflow needs tool use; keep unless the registry says it's unsupported.
  return m.tool_call !== false;
}

function toSpec(provider: ProviderName, m: RegistryModel): ModelSpec {
  const label = (m.name ?? m.id).replace(/\s*\(latest\)\s*$/i, "").trim();
  return { id: m.id, label, efforts: deriveEfforts(provider, m) };
}

/** Models discovered from the models.dev registry, keyed by genboard provider. */
export async function fetchRegistryModels(): Promise<Partial<Record<ProviderName, ModelSpec[]>>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let data: Record<string, { models?: Record<string, RegistryModel> }>;
  try {
    const res = await fetch(REGISTRY_URL, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`models.dev HTTP ${res.status}`);
    data = (await res.json()) as typeof data;
  } finally {
    clearTimeout(timer);
  }

  const out: Partial<Record<ProviderName, ModelSpec[]>> = {};
  for (const [registryId, targets] of Object.entries(REGISTRY_SOURCE)) {
    const models = data?.[registryId]?.models;
    if (!models || typeof models !== "object") continue;
    const picked = Object.values(models)
      .filter(includeModel)
      .sort((a, b) => (b.release_date ?? "").localeCompare(a.release_date ?? ""));
    for (const provider of targets) {
      out[provider] = picked.map((m) => toSpec(provider, m));
    }
  }
  return out;
}

// `agent models` prints "Available models" then `<id> - <Label>` lines.
function parseCursorModels(text: string): ModelSpec[] {
  const specs: ModelSpec[] = [];
  for (const line of text.split("\n")) {
    const m = line.trim().match(/^(\S+)\s+-\s+(.+)$/);
    if (m) specs.push({ id: m[1], label: m[2].trim(), efforts: [] });
  }
  return specs;
}

/** Models discovered from CLIs that emit machine-readable ids (cursor only). */
export async function fetchCliModels(): Promise<Partial<Record<ProviderName, ModelSpec[]>>> {
  const out: Partial<Record<ProviderName, ModelSpec[]>> = {};
  try {
    const specs = parseCursorModels(await captureCli("agent", ["models"], 10_000));
    if (specs.length) out["cursor-cli"] = specs;
  } catch {
    // CLI missing / errored / timed out — fall back to the static catalog entry.
  }
  return out;
}
