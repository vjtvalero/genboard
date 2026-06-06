import { getSession, unauthorized, serverError, json } from "@/lib/api";
import { listReposForUser } from "@/lib/github/repos";
import { readWorkspaces } from "@/lib/workspace/config";

export const dynamic = "force-dynamic";

// GET /api/repos — list the user's GitHub repos, annotated with linked paths.
export async function GET() {
  const session = await getSession();
  if (!session?.accessToken) return unauthorized("Missing GitHub access token");

  try {
    const [repos, workspaces] = await Promise.all([
      listReposForUser(session.accessToken),
      readWorkspaces(),
    ]);
    const annotated = repos.map((r) => ({
      ...r,
      linkedPath: workspaces[r.fullName] ?? null,
    }));
    return json({ repos: annotated });
  } catch (err) {
    return serverError((err as Error).message);
  }
}
