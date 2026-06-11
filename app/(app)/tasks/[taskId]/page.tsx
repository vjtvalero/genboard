import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getMode } from "@/lib/mode";
import { getUserByLogin, isUserRole, roleToMode } from "@/lib/users";
import { userCanAccessRepository } from "@/lib/repositories";
import TaskDetail from "@/components/tasks/TaskDetail";
import type { Priority, TaskStatus, UserRole } from "@/types";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({
  params,
}: {
  params: { taskId: string };
}) {
  const task = await prisma.task.findUnique({
    where: { id: params.taskId },
    include: {
      events: {
        include: { actor: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!task) notFound();

  const session = await auth();
  const user = session?.githubLogin ? await getUserByLogin(session.githubLogin) : null;
  if (!user || !(await userCanAccessRepository(user, task.repoFullName))) notFound();
  const role: UserRole = isUserRole(user.role) ? user.role : "pm";
  const mode = roleToMode(role, getMode());

  return (
    <TaskDetail
      mode={mode}
      task={{
        id: task.id,
        repoFullName: task.repoFullName,
        branchName: task.branchName,
        title: task.title,
        prompt: task.prompt,
        status: task.status as TaskStatus,
        priority: task.priority as Priority,
        latestResultId: task.latestResultId,
      }}
      events={task.events.map((e) => ({
        id: e.id,
        kind: e.kind,
        actorMode: e.actorMode,
        actorLogin: e.actor?.githubLogin ?? null,
        detail: e.detail,
        createdAt: e.createdAt.toISOString(),
      }))}
    />
  );
}
