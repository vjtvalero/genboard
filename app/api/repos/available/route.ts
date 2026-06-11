import { json, requireRole, serverError, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/db";
import { listReposForUser } from "@/lib/github/repos";
import { membershipUserIdsByRepositoryId } from "@/lib/repositories";
import { readWorkspaces, workspacePathForRepo } from "@/lib/workspace/config";

export const dynamic = "force-dynamic";

// GET /api/repos/available — admin GitHub repo list annotated with Genboard state.
export async function GET() {
  const ctx = await requireRole(["admin"]);
  if (ctx instanceof Response) return ctx;
  if (!ctx.session.accessToken) return unauthorized("Missing GitHub access token");

  try {
    const [githubRepos, repositories, membershipsByRepoId, workspaces] = await Promise.all([
      listReposForUser(ctx.session.accessToken),
      prisma.repository.findMany(),
      membershipUserIdsByRepositoryId(),
      readWorkspaces(),
    ]);
    const repositoryByFullName = new Map(repositories.map((repo) => [repo.fullName, repo]));

    const repos = githubRepos.map((githubRepo) => {
      const repository = repositoryByFullName.get(githubRepo.fullName);
      return {
        ...githubRepo,
        id: repository?.id,
        enabled: repository?.enabled ?? false,
        membershipUserIds: repository
          ? membershipsByRepoId.get(repository.id) ?? []
          : [],
        localPath: workspaces[githubRepo.fullName] ?? workspacePathForRepo(githubRepo.fullName),
        cloned: Boolean(workspaces[githubRepo.fullName]),
      };
    });

    return json({ repos });
  } catch (err) {
    return serverError((err as Error).message);
  }
}
