import { badRequest, serverError, json, requireRole } from "@/lib/api";
import { CATALOG, type ProviderName } from "@/lib/ai/catalog";
import { keySource, maskedKey, setApiKey } from "@/lib/ai/secrets";
import { validateApiKey } from "@/lib/ai/validate";

export const dynamic = "force-dynamic";

const API_PROVIDERS = CATALOG.filter((p) => p.kind === "api" && p.envKey);

function statusList() {
  return API_PROVIDERS.map((p) => ({
    provider: p.name,
    label: p.label,
    envKey: p.envKey,
    source: keySource(p.name),
    masked: maskedKey(p.name),
  }));
}

// GET /api/ai-keys — per-provider key status (never the raw key). Admin only.
export async function GET() {
  const ctx = await requireRole(["admin"]);
  if (ctx instanceof Response) return ctx;
  return json({ keys: statusList() });
}

// PUT /api/ai-keys — { provider, key } sets a key; an empty key clears it. Admin only.
export async function PUT(req: Request) {
  const ctx = await requireRole(["admin"]);
  if (ctx instanceof Response) return ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const { provider, key } = (body ?? {}) as { provider?: string; key?: string };
  if (!provider || !API_PROVIDERS.some((p) => p.name === provider)) {
    return badRequest("Unknown or non-API provider");
  }
  if (key != null && typeof key !== "string") {
    return badRequest("key must be a string");
  }

  try {
    await setApiKey(provider as ProviderName, key ?? "");
    return json({ keys: statusList() });
  } catch (err) {
    return serverError((err as Error).message);
  }
}

// POST /api/ai-keys — { provider, key? } validates a key against the provider's
// (free, token-free) list-models endpoint. Tests the draft key if given, else
// the stored/env key. Admin only.
export async function POST(req: Request) {
  const ctx = await requireRole(["admin"]);
  if (ctx instanceof Response) return ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const { provider, key } = (body ?? {}) as { provider?: string; key?: string };
  if (!provider || !API_PROVIDERS.some((p) => p.name === provider)) {
    return badRequest("Unknown or non-API provider");
  }
  if (key != null && typeof key !== "string") {
    return badRequest("key must be a string");
  }

  const result = await validateApiKey(provider as ProviderName, key);
  return json({ result });
}
