import { serverError, json, requireRole } from "@/lib/api";
import { availableProviders } from "@/lib/ai/config";
import { getEffectiveCatalog, refreshModelCache } from "@/lib/ai/model-cache";

export const dynamic = "force-dynamic";

// POST /api/ai-config/refresh — force a re-pull of the model list from
// models.dev + the CLIs, then return the fresh catalog. Admin only.
export async function POST() {
  const ctx = await requireRole(["admin"]);
  if (ctx instanceof Response) return ctx;
  try {
    const { fetchedAt } = await refreshModelCache();
    return json({
      catalog: await getEffectiveCatalog(),
      available: availableProviders(),
      modelsFetchedAt: fetchedAt,
    });
  } catch (err) {
    return serverError((err as Error).message);
  }
}
