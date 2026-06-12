import { octokitFromToken } from "./octokit";
import type { RepoBranch, RepoSummary } from "@/types";

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

export async function getRepoSummary(
  token: string,
  repoFullName: string,
): Promise<RepoSummary> {
  const [owner, repo] = repoFullName.split("/");
  if (!owner || !repo) throw new Error(`Invalid repo name: ${repoFullName}`);

  const octokit = octokitFromToken(token);
  const { data } = await octokit.repos.get({ owner, repo });
  return {
    fullName: data.full_name,
    name: data.name,
    owner: data.owner?.login ?? owner,
    private: data.private,
    defaultBranch: data.default_branch ?? "main",
    htmlUrl: data.html_url,
  };
}

export async function listBranchesForRepo(
  token: string,
  repoFullName: string,
): Promise<RepoBranch[]> {
  const [owner, repo] = repoFullName.split("/");
  if (!owner || !repo) throw new Error(`Invalid repo name: ${repoFullName}`);

  const octokit = octokitFromToken(token);
  const branches = await octokit.paginate(octokit.repos.listBranches, {
    owner,
    repo,
    per_page: 100,
  });

  return branches.map((b) => ({
    name: b.name,
    protected: b.protected,
  }));
}

export async function getRepoDefaultBranch(
  token: string,
  repoFullName: string,
): Promise<string> {
  const [owner, repo] = repoFullName.split("/");
  if (!owner || !repo) throw new Error(`Invalid repo name: ${repoFullName}`);

  const octokit = octokitFromToken(token);
  const { data } = await octokit.repos.get({ owner, repo });
  return data.default_branch ?? "main";
}

export interface PullRequestResult {
  number: number;
  htmlUrl: string;
}

export async function createPullRequest(
  token: string,
  repoFullName: string,
  input: {
    title: string;
    body: string;
    head: string;
    base: string;
  },
): Promise<PullRequestResult> {
  const [owner, repo] = repoFullName.split("/");
  if (!owner || !repo) throw new Error(`Invalid repo name: ${repoFullName}`);

  const octokit = octokitFromToken(token);
  const { data } = await octokit.pulls.create({
    owner,
    repo,
    title: input.title,
    body: input.body,
    head: input.head,
    base: input.base,
    maintainer_can_modify: true,
  });

  return {
    number: data.number,
    htmlUrl: data.html_url,
  };
}

export interface PullRequestState {
  state: "open" | "closed";
  merged: boolean;
  mergedAt: Date | null;
}

/** Fetch the current open/closed + merged state of a pull request. */
export async function getPullRequestState(
  token: string,
  repoFullName: string,
  prNumber: number,
): Promise<PullRequestState> {
  const [owner, repo] = repoFullName.split("/");
  if (!owner || !repo) throw new Error(`Invalid repo name: ${repoFullName}`);

  const octokit = octokitFromToken(token);
  const { data } = await octokit.pulls.get({ owner, repo, pull_number: prNumber });

  return {
    state: data.state as "open" | "closed",
    merged: Boolean(data.merged),
    mergedAt: data.merged_at ? new Date(data.merged_at) : null,
  };
}
