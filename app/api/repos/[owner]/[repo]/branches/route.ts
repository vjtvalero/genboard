import { unauthorized, serverError, json, forbidden, requireUser } from "@/lib/api";
import { getRepoDefaultBranch, listBranchesForRepo } from "@/lib/github/repos";
import { userCanAccessRepository } from "@/lib/repositories";

export const dynamic = "force-dynamic";

// GET /api/repos/:owner/:repo/branches — list branches for the selected repo.
export async function GET(
  _req: Request,
  { params }: { params: { owner: string; repo: string } },
) {
  const ctx = await requireUser();
  if (ctx instanceof Response) return ctx;
  if (!ctx.session.accessToken) return unauthorized("Missing GitHub access token");

  try {
    const repoFullName = `${decodeURIComponent(params.owner)}/${decodeURIComponent(params.repo)}`;
    if (!(await userCanAccessRepository(ctx.user, repoFullName))) {
      return forbidden("You do not have access to this repository.");
    }
    const [branches, defaultBranch] = await Promise.all([
      listBranchesForRepo(ctx.session.accessToken, repoFullName),
      getRepoDefaultBranch(ctx.session.accessToken, repoFullName),
    ]);
    return json({ branches, defaultBranch });
  } catch (err) {
    return serverError((err as Error).message);
  }
}
