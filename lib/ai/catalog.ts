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
    models: [{ id: "default", label: "Default (Gemini)", efforts: [] }],
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

/** Validate a settings object against the catalog. */
export function isValidSettings(s: unknown): s is AISettings {
  if (!s || typeof s !== "object") return false;
  const { provider, model, effort } = s as AISettings;
  const spec = providerSpec(provider);
  if (!spec) return false;
  if (!spec.models.some((m) => m.id === model)) return false;
  const allowed = effortsFor(provider, model);
  if (effort == null) return allowed.length === 0 ? true : allowed.length >= 0; // null always allowed
  return allowed.includes(effort);
}

/** Coerce arbitrary settings to a valid shape, repairing model/effort as needed. */
export function normalizeSettings(s: Partial<AISettings> | undefined): AISettings {
  const provider = providerSpec(s?.provider as ProviderName)
    ? (s!.provider as ProviderName)
    : DEFAULT_SETTINGS.provider;
  const models = modelsFor(provider);
  const model = models.some((m) => m.id === s?.model)
    ? (s!.model as string)
    : (models[0]?.id ?? DEFAULT_SETTINGS.model);
  const allowed = effortsFor(provider, model);
  let effort: Effort | null;
  if (allowed.length === 0) {
    effort = null;
  } else if (s?.effort && allowed.includes(s.effort)) {
    effort = s.effort;
  } else {
    effort = allowed.includes("high") ? "high" : allowed[0];
  }
  return { provider, model, effort };
}
