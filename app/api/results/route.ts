import { badRequest, forbidden, json, requireUser } from "@/lib/api";
import { userCanAccessRepository } from "@/lib/repositories";
import { pendingReviewResults } from "@/lib/results";

export const dynamic = "force-dynamic";

// GET /api/results?repo=owner/repo — the result-centric review queue for a repo.
// Lists every live Result regardless of origin (execute flow or task chat).
export async function GET(req: Request) {
  const ctx = await requireUser();
  if (ctx instanceof Response) return ctx;

  const repo = new URL(req.url).searchParams.get("repo");
  if (!repo) return badRequest("Missing repo query parameter.");
  if (!(await userCanAccessRepository(ctx.user, repo))) {
    return forbidden("You do not have access to this repository.");
  }

  const results = await pendingReviewResults(repo);
  return json({ results });
}
