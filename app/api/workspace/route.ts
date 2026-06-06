import { getSession, unauthorized, badRequest, serverError, json } from "@/lib/api";
import { readWorkspaces, setWorkspace, removeWorkspace } from "@/lib/workspace/config";
import { validateRepoPath } from "@/lib/git/validate";

export const dynamic = "force-dynamic";

// GET /api/workspace — current repo → path map.
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();
  return json({ workspaces: await readWorkspaces() });
}

// POST /api/workspace — { repoFullName, localPath } to link, or { repoFullName, remove: true }.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  let body: { repoFullName?: string; localPath?: string; remove?: boolean };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const { repoFullName, localPath, remove } = body;
  if (!repoFullName) return badRequest("repoFullName is required");

  try {
    if (remove) {
      return json({ workspaces: await removeWorkspace(repoFullName) });
    }
    if (!localPath) return badRequest("localPath is required");

    const check = await validateRepoPath(localPath);
    if (!check.ok || !check.absPath) {
      return badRequest(check.reason ?? "Invalid path");
    }
    return json({ workspaces: await setWorkspace(repoFullName, check.absPath) });
  } catch (err) {
    return serverError((err as Error).message);
  }
}
