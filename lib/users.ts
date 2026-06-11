import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Mode, UserRole, UserSummary } from "@/types";

const ROLES: UserRole[] = ["pm", "se", "admin"];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && ROLES.includes(value as UserRole);
}

function parseLoginList(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

function configuredAdminLogins(): Set<string> {
  return parseLoginList(
    process.env.GENBOARD_ADMIN_GITHUB_LOGINS ?? process.env.GENBOARD_ADMINS,
  );
}

function defaultRole(): UserRole {
  return isUserRole(process.env.GENBOARD_DEFAULT_ROLE)
    ? process.env.GENBOARD_DEFAULT_ROLE
    : "pm";
}

async function roleForNewUser(githubLogin: string): Promise<UserRole> {
  if (configuredAdminLogins().has(githubLogin.toLowerCase())) return "admin";
  const userCount = await prisma.user.count();
  return userCount === 0 ? "admin" : defaultRole();
}

export interface GitHubUserInput {
  githubId?: string | null;
  githubLogin: string;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
}

export async function upsertGitHubUser(input: GitHubUserInput): Promise<User> {
  const existing = await prisma.user.findUnique({
    where: { githubLogin: input.githubLogin },
  });
  const configuredAdmin = configuredAdminLogins().has(input.githubLogin.toLowerCase());
  const role = configuredAdmin
    ? "admin"
    : existing?.role ?? (await roleForNewUser(input.githubLogin));

  return prisma.user.upsert({
    where: { githubLogin: input.githubLogin },
    update: {
      githubId: input.githubId ?? undefined,
      email: input.email ?? undefined,
      name: input.name ?? undefined,
      avatarUrl: input.avatarUrl ?? undefined,
      role,
    },
    create: {
      githubId: input.githubId ?? null,
      githubLogin: input.githubLogin,
      email: input.email ?? null,
      name: input.name ?? null,
      avatarUrl: input.avatarUrl ?? null,
      role,
    },
  });
}

export async function getUserByLogin(githubLogin: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { githubLogin } });
}

export function roleToMode(role: UserRole, preferred?: Mode): Mode {
  if (preferred) return preferred;
  if (role === "se") return "se";
  return "pm";
}

export function hasRole(role: UserRole, allowed: UserRole[]): boolean {
  return role === "admin" || allowed.includes(role);
}

export function serializeUser(user: User): UserSummary {
  return {
    id: user.id,
    githubLogin: user.githubLogin,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: isUserRole(user.role) ? user.role : "pm",
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
