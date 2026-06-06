import { getSession, unauthorized, badRequest, serverError, json } from "@/lib/api";
import { getAISettings, setAISettings, availableProviders } from "@/lib/ai/config";
import { CATALOG, isValidSettings } from "@/lib/ai/catalog";

export const dynamic = "force-dynamic";

// GET /api/ai-config — current settings + catalog + which providers are usable.
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();
  return json({
    settings: await getAISettings(),
    catalog: CATALOG,
    available: availableProviders(),
  });
}

// PUT /api/ai-config — { provider, model, effort } global default.
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

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
