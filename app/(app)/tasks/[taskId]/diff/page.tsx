import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getUserByLogin } from "@/lib/users";
import { userCanAccessRepository } from "@/lib/repositories";

export const dynamic = "force-dynamic";

// Back-compat shim: the diff view is now result-centric at /results/[resultId].
// Resolve the task's latest result and redirect there.
export default async function TaskDiffRedirect({
  params,
}: {
  params: { taskId: string };
}) {
  const task = await prisma.task.findUnique({ where: { id: params.taskId } });
  if (!task) notFound();
  const session = await auth();
  const user = session?.githubLogin ? await getUserByLogin(session.githubLogin) : null;
  if (!user || !(await userCanAccessRepository(user, task.repoFullName))) notFound();

  const result = task.latestResultId
    ? await prisma.result.findUnique({
        where: { id: task.latestResultId },
        select: { id: true },
      })
    : await prisma.result.findFirst({
        where: { taskId: task.id },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });

  if (!result) redirect(`/tasks/${task.id}`);
  redirect(`/results/${result.id}`);
}
