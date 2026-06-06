import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getMode } from "@/lib/mode";
import TaskDetail from "@/components/tasks/TaskDetail";
import type { Priority, TaskStatus } from "@/types";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({
  params,
}: {
  params: { taskId: string };
}) {
  const task = await prisma.task.findUnique({
    where: { id: params.taskId },
    include: { events: { orderBy: { createdAt: "asc" } } },
  });
  if (!task) notFound();

  const mode = getMode();

  return (
    <TaskDetail
      mode={mode}
      task={{
        id: task.id,
        repoFullName: task.repoFullName,
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
        detail: e.detail,
        createdAt: e.createdAt.toISOString(),
      }))}
    />
  );
}
