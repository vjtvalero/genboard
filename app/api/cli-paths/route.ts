import { badRequest, serverError, json, requireRole } from "@/lib/api";
import { CATALOG } from "@/lib/ai/catalog";
import { resolveCliInfo } from "@/lib/ai/spawn";
import { setCliPath } from "@/lib/ai/cli-paths";

export const dynamic = "force-dynamic";

const CLI_PROVIDERS = CATALOG.filter((p) => p.kind === "cli" && p.cliCommand);

function statusList() {
  return CLI_PROVIDERS.map((p) => {
    const command = p.cliCommand as string;
    const info = resolveCliInfo(command);
    return { provider: p.name, label: p.label, command, ...info };
  });
}

// GET /api/cli-paths — per-provider CLI resolution status. Admin only.
export async function GET() {
  const ctx = await requireRole(["admin"]);
  if (ctx instanceof Response) return ctx;
  return json({ clis: statusList() });
}

// PUT /api/cli-paths — { provider, path } pins a path; an empty path clears it. Admin only.
export async function PUT(req: Request) {
  const ctx = await requireRole(["admin"]);
  if (ctx instanceof Response) return ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const { provider, path: value } = (body ?? {}) as { provider?: string; path?: string };
  const spec = CLI_PROVIDERS.find((p) => p.name === provider);
  if (!spec) return badRequest("Unknown or non-CLI provider");
  if (value != null && typeof value !== "string") {
    return badRequest("path must be a string");
  }

  try {
    await setCliPath(spec.cliCommand as string, value ?? "");
    return json({ clis: statusList() });
  } catch (err) {
    return serverError((err as Error).message);
  }
}
