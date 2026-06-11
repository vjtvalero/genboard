import { badRequest, json, notFound, requireRole, serverError } from "@/lib/api";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// PATCH /api/repos/:owner/:repo/members — admin grants/revokes user access.
export async function PATCH(
  req: Request,
  { params }: { params: { owner: string; repo: string } },
) {
  const ctx = await requireRole(["admin"]);
  if (ctx instanceof Response) return ctx;

  let body: { userId?: string; access?: boolean };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (!body.userId) return badRequest("userId is required");
  if (typeof body.access !== "boolean") return badRequest("access is required");

  const repoFullName = `${decodeURIComponent(params.owner)}/${decodeURIComponent(params.repo)}`;
  try {
    const [repository, user] = await Promise.all([
      prisma.repository.findUnique({ where: { fullName: repoFullName } }),
      prisma.user.findUnique({ where: { id: body.userId } }),
    ]);
    if (!repository) return notFound("Repository is not managed by Genboard");
    if (!user) return notFound("User not found");

    if (body.access) {
      await prisma.repositoryMembership.upsert({
        where: {
          repositoryId_userId: {
            repositoryId: repository.id,
            userId: user.id,
          },
        },
        update: {},
        create: {
          repositoryId: repository.id,
          userId: user.id,
        },
      });
    } else {
      await prisma.repositoryMembership.deleteMany({
        where: {
          repositoryId: repository.id,
          userId: user.id,
        },
      });
    }

    const memberships = await prisma.repositoryMembership.findMany({
      where: { repositoryId: repository.id },
      select: { userId: true },
    });
    return json({ membershipUserIds: memberships.map((membership) => membership.userId) });
  } catch (err) {
    return serverError((err as Error).message);
  }
}
