import { octokitFromToken } from "./octokit";
import type { RepoSummary } from "@/types";

/**
 * List the authenticated user's repos (most-recently-updated first), where they
 * have push access. Paginates up to a sane cap.
 */
export async function listReposForUser(token: string): Promise<RepoSummary[]> {
  const octokit = octokitFromToken(token);

  const repos = await octokit.paginate(octokit.repos.listForAuthenticatedUser, {
    per_page: 100,
    sort: "updated",
    affiliation: "owner,collaborator,organization_member",
  });

  return repos
    .filter((r) => r.permissions?.push !== false)
    .map((r) => ({
      fullName: r.full_name,
      name: r.name,
      owner: r.owner?.login ?? "",
      private: r.private,
      defaultBranch: r.default_branch ?? "main",
      htmlUrl: r.html_url,
    }));
}
