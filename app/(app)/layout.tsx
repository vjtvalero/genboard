import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getMode } from "@/lib/mode";
import RepoSwitcher from "@/components/layout/RepoSwitcher";
import ModeSwitcher from "@/components/layout/ModeSwitcher";
import AISwitcher from "@/components/layout/AISwitcher";
import SignOutButton from "@/components/layout/SignOutButton";
import Sidebar from "@/components/layout/Sidebar";
import { getAISettings, availableProviders } from "@/lib/ai/config";
import { getEffectiveCatalog } from "@/lib/ai/model-cache";
import { getUserByLogin, isUserRole, roleToMode } from "@/lib/users";
import { userCanAccessRepository } from "@/lib/repositories";
import type { Priority, TaskStatus, UserRole } from "@/types";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!session.githubLogin) redirect("/login");

  const user = await getUserByLogin(session.githubLogin);
  if (!user) redirect("/login");
  const role: UserRole = isUserRole(user.role) ? user.role : "pm";
  const mode = roleToMode(role, getMode());
  const selectedRepoCookie = cookies().get("genboard_repo")?.value ?? null;
  const selectedRepo =
    selectedRepoCookie && (await userCanAccessRepository(user, selectedRepoCookie))
      ? selectedRepoCookie
      : null;
  const aiSettings = await getAISettings();
  const isAdmin = role === "admin";
  const aiCatalog = isAdmin ? await getEffectiveCatalog() : [];

  const dbTasks = selectedRepo
    ? await prisma.task.findMany({
        where: { repoFullName: selectedRepo },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: { id: true, title: true, status: true, priority: true },
      })
    : [];
  const tasks = dbTasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status as TaskStatus,
    priority: t.priority as Priority,
  }));

  return (
    <div data-mode={mode} className="flex h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-neutral-800 bg-neutral-900/70 px-4 py-2.5">
        <Link href="/tasks" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="accent-text text-lg">◆</span> Genboard
        </Link>
        <div className="ml-2 flex-1">
          <RepoSwitcher selectedRepo={selectedRepo} />
        </div>
        {isAdmin && (
          <AISwitcher settings={aiSettings} catalog={aiCatalog} available={availableProviders()} />
        )}
        <ModeSwitcher mode={mode} role={role} canSwitch />
        <Link
          href="/settings"
          className="rounded-md px-2.5 py-1.5 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
        >
          Settings
        </Link>
        <div className="flex items-center gap-2 text-sm text-neutral-400">
          <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs uppercase text-neutral-400">
            {role}
          </span>
          {session.githubLogin && <span>@{session.githubLogin}</span>}
          <SignOutButton />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-64 shrink-0 overflow-y-auto border-r border-neutral-800 bg-neutral-900/40">
          <Sidebar tasks={tasks} selectedRepo={selectedRepo} mode={mode} />
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
