// ─────────────────────────────────────────────────────────────────────────────
// AI provider / model / effort catalog — single source of truth for the UI and
// for server-side validation. Effort levels are encoded per-model so the switcher
// only ever offers (and we only ever send) a level the model accepts.
// ─────────────────────────────────────────────────────────────────────────────

export type ProviderName =
  | "claude-api"
  | "openai"
  | "google"
  | "claude-cli"
  | "codex"
  | "agy"
  | "cursor-cli";

export type ProviderKind = "api" | "cli";
export type ExecMode = "patch" | "apply";

export type Effort =
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max"
  | "dynamic";

/** Every effort token the app understands — used to validate dynamic models. */
export const EFFORTS: Effort[] = [
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "dynamic",
];

export interface ModelSpec {
  id: string;
  label: string;
  /** Valid effort levels for this model. Empty = no reasoning-effort control. */
  efforts: Effort[];
}

export interface ProviderSpec {
  name: ProviderName;
  label: string;
  kind: ProviderKind;
  mode: ExecMode;
  /** Env var that must be set for an API provider; null for CLI providers. */
  envKey: string | null;
  /** Binary name to detect on PATH for a CLI provider; null for API providers. */
  cliCommand?: string | null;
  models: ModelSpec[];
}

export interface AISettings {
  provider: ProviderName;
  model: string;
  effort: Effort | null;
}

// Common effort tiers reused across Anthropic-tier models.
const ANTHROPIC_OPUS_NEW: Effort[] = ["low", "medium", "high", "xhigh", "max"];
const ANTHROPIC_OPUS_46: Effort[] = ["low", "medium", "high", "max"];
const ANTHROPIC_SONNET: Effort[] = ["low", "medium", "high"];
const OPENAI_REASONING: Effort[] = ["minimal", "low", "medium", "high"];
const GOOGLE_THINKING: Effort[] = ["low", "medium", "high", "dynamic"];

// Claude model list shared by claude-api and claude-cli.
const CLAUDE_MODELS: ModelSpec[] = [
  { id: "claude-opus-4-8", label: "Opus 4.8", efforts: ANTHROPIC_OPUS_NEW },
  { id: "claude-opus-4-7", label: "Opus 4.7", efforts: ANTHROPIC_OPUS_NEW },
  { id: "claude-opus-4-6", label: "Opus 4.6", efforts: ANTHROPIC_OPUS_46 },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", efforts: ANTHROPIC_SONNET },
  { id: "claude-haiku-4-5", label: "Haiku 4.5", efforts: [] },
];

// OpenAI model list shared by the openai API provider and the codex CLI.
const OPENAI_MODELS: ModelSpec[] = [
  { id: "gpt-5", label: "GPT-5", efforts: OPENAI_REASONING },
  { id: "gpt-5-mini", label: "GPT-5 mini", efforts: OPENAI_REASONING },
  { id: "o3", label: "o3", efforts: OPENAI_REASONING },
  { id: "o4-mini", label: "o4-mini", efforts: OPENAI_REASONING },
  { id: "gpt-4o", label: "GPT-4o", efforts: [] },
  { id: "gpt-4o-mini", label: "GPT-4o mini", efforts: [] },
];

const GOOGLE_MODELS: ModelSpec[] = [
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", efforts: GOOGLE_THINKING },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", efforts: GOOGLE_THINKING },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", efforts: GOOGLE_THINKING },
];

// Cursor Agent CLI — effort is encoded in the model slug, not a separate control.
const CURSOR_MODELS: ModelSpec[] = [
  { id: "composer-2.5-fast", label: "Composer 2.5 Fast", efforts: [] },
  { id: "composer-2.5", label: "Composer 2.5", efforts: [] },
  { id: "auto", label: "Auto", efforts: [] },
  { id: "claude-4.6-sonnet-medium-thinking", label: "Sonnet 4.6 Thinking", efforts: [] },
  { id: "claude-opus-4-8-high", label: "Opus 4.8", efforts: [] },
  { id: "gpt-5.3-codex", label: "GPT-5.3 Codex", efforts: [] },
  { id: "gpt-5.5-medium", label: "GPT-5.5", efforts: [] },
];

export const CATALOG: ProviderSpec[] = [
  {
    name: "claude-api",
    label: "Claude API",
    kind: "api",
    mode: "patch",
    envKey: "ANTHROPIC_API_KEY",
    models: CLAUDE_MODELS,
  },
  {
    name: "openai",
    label: "OpenAI",
    kind: "api",
    mode: "patch",
    envKey: "OPENAI_API_KEY",
    models: OPENAI_MODELS,
  },
  {
    name: "google",
    label: "Google",
    kind: "api",
    mode: "patch",
    envKey: "GOOGLE_GENERATIVE_AI_API_KEY",
    models: GOOGLE_MODELS,
  },
  {
    name: "claude-cli",
    label: "Claude CLI",
    kind: "cli",
    mode: "patch",
    envKey: null,
    cliCommand: "claude",
    models: CLAUDE_MODELS,
  },
  {
    name: "codex",
    label: "Codex CLI",
    kind: "cli",
    mode: "apply",
    envKey: null,
    cliCommand: "codex",
    models: OPENAI_MODELS.filter((m) => m.efforts.length > 0),
  },
  {
    name: "agy",
    label: "Antigravity CLI",
    kind: "cli",
    mode: "apply",
    envKey: null,
    cliCommand: "agy",
    // Antigravity is a multi-vendor gateway that picks the model from its own CLI
    // config (no readable default, no stable per-model ids), so Genboard can't
    // drive or discover its model — it runs whatever the agy CLI is set to.
    models: [{ id: "default", label: "Set in agy CLI", efforts: [] }],
  },
  {
    name: "cursor-cli",
    label: "Cursor CLI",
    kind: "cli",
    mode: "apply",
    envKey: null,
    cliCommand: "agent",
    models: CURSOR_MODELS,
  },
];

export const DEFAULT_SETTINGS: AISettings = {
  provider: "claude-api",
  model: "claude-opus-4-8",
  effort: "high",
};

export function providerSpec(name: ProviderName): ProviderSpec | undefined {
  return CATALOG.find((p) => p.name === name);
}

export function modelsFor(name: ProviderName): ModelSpec[] {
  return providerSpec(name)?.models ?? [];
}

export function effortsFor(name: ProviderName, modelId: string): Effort[] {
  return modelsFor(name).find((m) => m.id === modelId)?.efforts ?? [];
}

export function execModeFor(name: ProviderName): ExecMode {
  return providerSpec(name)?.mode ?? "patch";
}

/**
 * Validate a settings object. Models are now discovered dynamically (see
 * model-cache.ts), so a valid model need not be in the static catalog — we only
 * require a known provider, a non-empty model id, and a recognized effort token.
 * The switcher constrains effort to the model's tier; providers tolerate any
 * level. (The static-list check would reject newly-released models.)
 */
export function isValidSettings(s: unknown): s is AISettings {
  if (!s || typeof s !== "object") return false;
  const { provider, model, effort } = s as AISettings;
  if (!providerSpec(provider)) return false;
  if (typeof model !== "string" || !model.trim()) return false;
  if (effort == null) return true;
  return EFFORTS.includes(effort);
}

/**
 * Coerce arbitrary settings to a valid shape. Keeps a non-empty model id as-is
 * (it may be a dynamically-discovered model absent from the static catalog),
 * falling back to a static default only when the model is missing. Effort is
 * trusted when it's a known token; otherwise it defaults from the static model's
 * tier when one is known, else null.
 */
export function normalizeSettings(s: Partial<AISettings> | undefined): AISettings {
  const provider = providerSpec(s?.provider as ProviderName)
    ? (s!.provider as ProviderName)
    : DEFAULT_SETTINGS.provider;
  const models = modelsFor(provider);
  const model =
    typeof s?.model === "string" && s.model.trim()
      ? s.model
      : (models[0]?.id ?? DEFAULT_SETTINGS.model);

  let effort: Effort | null;
  if (s?.effort && EFFORTS.includes(s.effort)) {
    effort = s.effort;
  } else {
    // Unknown/absent effort: seed from the static model's tier if we have one.
    const staticEfforts = models.find((m) => m.id === model)?.efforts ?? [];
    effort = staticEfforts.length === 0 ? null : staticEfforts.includes("high") ? "high" : staticEfforts[0];
  }
  return { provider, model, effort };
}
