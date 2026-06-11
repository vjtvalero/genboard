import { badRequest, json, requireRole, requireUser, serverError, unauthorized } from "@/lib/api";
import { getRepoSummary } from "@/lib/github/repos";
import {
  accessibleRepositoriesForUser,
  serializeRepository,
} from "@/lib/repositories";
import { prisma } from "@/lib/db";
import { readWorkspaces, workspacePathForRepo } from "@/lib/workspace/config";

export const dynamic = "force-dynamic";

// GET /api/repos — list enabled Genboard repos this user can access.
export async function GET() {
  const ctx = await requireUser();
  if (ctx instanceof Response) return ctx;

  try {
    const [repositories, workspaces] = await Promise.all([
      accessibleRepositoriesForUser(ctx.user),
      readWorkspaces(),
    ]);
    const annotated = repositories.map((repo) =>
      serializeRepository(repo, {
        localPath: workspaces[repo.fullName] ?? workspacePathForRepo(repo.fullName),
        cloned: Boolean(workspaces[repo.fullName]),
      }),
    );
    return json({ repos: annotated });
  } catch (err) {
    return serverError((err as Error).message);
  }
}

// POST /api/repos — admin enables a GitHub repo as a Genboard repository.
export async function POST(req: Request) {
  const ctx = await requireRole(["admin"]);
  if (ctx instanceof Response) return ctx;
  if (!ctx.session.accessToken) return unauthorized("Missing GitHub access token");

  let body: { repoFullName?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (!body.repoFullName) return badRequest("repoFullName is required");

  try {
    const summary = await getRepoSummary(ctx.session.accessToken, body.repoFullName);
    const repository = await prisma.repository.upsert({
      where: { fullName: summary.fullName },
      update: {
        owner: summary.owner,
        name: summary.name,
        private: summary.private,
        defaultBranch: summary.defaultBranch,
        htmlUrl: summary.htmlUrl,
        enabled: true,
      },
      create: {
        fullName: summary.fullName,
        owner: summary.owner,
        name: summary.name,
        private: summary.private,
        defaultBranch: summary.defaultBranch,
        htmlUrl: summary.htmlUrl,
        enabled: true,
        addedByUserId: ctx.user.id,
      },
    });

    await prisma.repositoryMembership.upsert({
      where: {
        repositoryId_userId: {
          repositoryId: repository.id,
          userId: ctx.user.id,
        },
      },
      update: {},
      create: {
        repositoryId: repository.id,
        userId: ctx.user.id,
      },
    });

    return json({ repository: serializeRepository(repository) }, { status: 201 });
  } catch (err) {
    return serverError((err as Error).message);
  }
}
