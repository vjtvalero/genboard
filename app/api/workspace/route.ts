import { getSession, unauthorized, badRequest, json, requireRole } from "@/lib/api";
import { readWorkspaces, workspacePathForRepo } from "@/lib/workspace/config";

export const dynamic = "force-dynamic";

// GET /api/workspace — managed repo -> bare mirror path map for cached repos.
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();
  return json({ workspaces: await readWorkspaces() });
}

// POST /api/workspace — manual path linking is no longer supported.
export async function POST(req: Request) {
  const ctx = await requireRole(["admin"]);
  if (ctx instanceof Response) return ctx;

  let body: { repoFullName?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const { repoFullName } = body;
  if (!repoFullName) return badRequest("repoFullName is required");

  return json({
    ok: false,
    error: "Genboard now manages git mirrors and worktrees automatically under ~/.genboard.",
    localPath: workspacePathForRepo(repoFullName),
  }, { status: 410 });
}
