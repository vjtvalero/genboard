import { getSession, unauthorized, json } from "@/lib/api";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/tasks/[taskId]/activity — ordered ActivityEvent trail.
export async function GET(_req: Request, { params }: { params: { taskId: string } }) {
  const session = await getSession();
  if (!session) return unauthorized();

  const events = await prisma.activityEvent.findMany({
    where: { taskId: params.taskId },
    orderBy: { createdAt: "asc" },
  });
  return json({ events });
}
