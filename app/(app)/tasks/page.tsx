import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getUserByLogin } from "@/lib/users";
import { userCanAccessRepository } from "@/lib/repositories";
import TaskList from "@/components/tasks/TaskList";
import type { Priority, TaskStatus, TaskCard } from "@/types";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const session = await auth();
  const user = session?.githubLogin ? await getUserByLogin(session.githubLogin) : null;
  const selectedRepoCookie = cookies().get("genboard_repo")?.value ?? null;
  const selectedRepo =
    user && selectedRepoCookie && (await userCanAccessRepository(user, selectedRepoCookie))
      ? selectedRepoCookie
      : null;

  if (!selectedRepo) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md text-center">
          <h2 className="text-lg font-semibold">No repository selected</h2>
          <p className="mt-2 text-sm text-neutral-400">
            Pick a repository from the switcher above. Genboard will prepare an
            isolated worktree when a task runs.
          </p>
        </div>
      </div>
    );
  }

  const dbTasks = await prisma.task.findMany({
    where: { repoFullName: selectedRepo },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  const tasks: TaskCard[] = dbTasks.map((t) => ({
    id: t.id,
    repoFullName: t.repoFullName,
    branchName: t.branchName,
    title: t.title,
    prompt: t.prompt,
    status: t.status as TaskStatus,
    priority: t.priority as Priority,
    order: t.order,
    latestResultId: t.latestResultId,
    updatedAt: t.updatedAt.toISOString(),
  }));

  return (
    <div className="p-6">
      <TaskList tasks={tasks} repo={selectedRepo} />
    </div>
  );
}
