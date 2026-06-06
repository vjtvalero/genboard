import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getMode } from "@/lib/mode";
import TaskList from "@/components/tasks/TaskList";
import ReviewQueue from "@/components/tasks/ReviewQueue";
import type { Priority, TaskStatus, TaskCard } from "@/types";

export const dynamic = "force-dynamic";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: { view?: string };
}) {
  const mode = getMode();
  const selectedRepo = cookies().get("genboard_repo")?.value ?? null;
  const isReview = mode === "se" || searchParams.view === "review";

  if (!selectedRepo) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md text-center">
          <h2 className="text-lg font-semibold">No repository selected</h2>
          <p className="mt-2 text-sm text-neutral-400">
            Pick a repository from the switcher above. Link it to a local clone on
            the Settings page first if it isn&apos;t linked yet.
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
      {isReview ? (
        <ReviewQueue tasks={tasks} repo={selectedRepo} />
      ) : (
        <TaskList tasks={tasks} repo={selectedRepo} />
      )}
    </div>
  );
}
