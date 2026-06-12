import { getSession, unauthorized, badRequest, serverError, json, requireRole } from "@/lib/api";
import { getAISettings, setAISettings, availableProviders } from "@/lib/ai/config";
import { getEffectiveCatalog, getModelCacheFetchedAt } from "@/lib/ai/model-cache";
import { isValidSettings } from "@/lib/ai/catalog";

export const dynamic = "force-dynamic";

// GET /api/ai-config — current settings + (dynamically-discovered) catalog +
// which providers are usable + when the model list was last refreshed.
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();
  return json({
    settings: await getAISettings(),
    catalog: await getEffectiveCatalog(),
    available: availableProviders(),
    modelsFetchedAt: await getModelCacheFetchedAt(),
  });
}

// PUT /api/ai-config — { provider, model, effort } global default.
export async function PUT(req: Request) {
  const ctx = await requireRole(["admin"]);
  if (ctx instanceof Response) return ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (!isValidSettings(body)) {
    return badRequest("Invalid provider/model/effort combination");
  }

  try {
    const settings = await setAISettings(body);
    return json({ settings });
  } catch (err) {
    return serverError((err as Error).message);
  }
}
