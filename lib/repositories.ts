import type { Repository, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { RepoSummary } from "@/types";

type AccessUser = Pick<User, "id" | "role">;

export function splitRepoFullName(repoFullName: string): [string, string] {
  const [owner, name] = repoFullName.split("/");
  if (!owner || !name || repoFullName.split("/").length !== 2) {
    throw new Error(`Invalid repo name: ${repoFullName}`);
  }
  return [owner, name];
}

export function serializeRepository(
  repo: Repository,
  extra?: {
    localPath?: string;
    cloned?: boolean;
    membershipUserIds?: string[];
  },
): RepoSummary {
  return {
    id: repo.id,
    fullName: repo.fullName,
    owner: repo.owner,
    name: repo.name,
    private: repo.private,
    defaultBranch: repo.defaultBranch,
    htmlUrl: repo.htmlUrl,
    enabled: repo.enabled,
    localPath: extra?.localPath,
    cloned: extra?.cloned,
    membershipUserIds: extra?.membershipUserIds,
  };
}

export async function getRepositoryByFullName(
  repoFullName: string,
): Promise<Repository | null> {
  return prisma.repository.findUnique({ where: { fullName: repoFullName } });
}

export async function userCanAccessRepository(
  user: AccessUser,
  repoFullName: string,
): Promise<boolean> {
  if (user.role === "admin") {
    return Boolean(
      await prisma.repository.findFirst({
        where: { fullName: repoFullName, enabled: true },
        select: { id: true },
      }),
    );
  }

  const membership = await prisma.repositoryMembership.findFirst({
    where: {
      userId: user.id,
      repository: {
        fullName: repoFullName,
        enabled: true,
      },
    },
    select: { id: true },
  });

  return Boolean(membership);
}

export async function accessibleRepositoriesForUser(
  user: AccessUser,
): Promise<Repository[]> {
  if (user.role === "admin") {
    return prisma.repository.findMany({
      where: { enabled: true },
      orderBy: [{ updatedAt: "desc" }, { fullName: "asc" }],
    });
  }

  const memberships = await prisma.repositoryMembership.findMany({
    where: {
      userId: user.id,
      repository: { enabled: true },
    },
    include: { repository: true },
    orderBy: { repository: { fullName: "asc" } },
  });

  return memberships.map((membership) => membership.repository);
}

export async function membershipUserIdsByRepositoryId(): Promise<Map<string, string[]>> {
  const memberships = await prisma.repositoryMembership.findMany({
    select: { repositoryId: true, userId: true },
  });
  const out = new Map<string, string[]>();
  for (const membership of memberships) {
    const ids = out.get(membership.repositoryId) ?? [];
    ids.push(membership.userId);
    out.set(membership.repositoryId, ids);
  }
  return out;
}
