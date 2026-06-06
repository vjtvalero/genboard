import { getSession, unauthorized, badRequest, serverError, json } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getMode } from "@/lib/mode";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

// POST /api/tasks/reorder — { orderedIds: string[] } persists manual backlog order.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  let body: { orderedIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (!Array.isArray(body.orderedIds) || body.orderedIds.length === 0) {
    return badRequest("orderedIds (non-empty array) is required");
  }

  try {
    await prisma.$transaction(
      body.orderedIds.map((id, index) =>
        prisma.task.update({ where: { id }, data: { order: index } }),
      ),
    );
    // Record a single reorder event against the first task as a marker.
    await logActivity(body.orderedIds[0], "reordered", getMode(), "Backlog reordered");
    return json({ ok: true });
  } catch (err) {
    return serverError((err as Error).message);
  }
}
