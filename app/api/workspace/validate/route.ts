import { badRequest, json, requireRole } from "@/lib/api";
import { validateRepoPath } from "@/lib/git/validate";

export const dynamic = "force-dynamic";

// POST /api/workspace/validate — { localPath } → { ok, reason?, absPath? }
export async function POST(req: Request) {
  const ctx = await requireRole(["admin"]);
  if (ctx instanceof Response) return ctx;

  let body: { localPath?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (!body.localPath) return badRequest("localPath is required");

  const result = await validateRepoPath(body.localPath);
  return json(result);
}
