import { badRequest, json, notFound, requireRole, serverError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { isUserRole, serializeUser } from "@/lib/users";
import type { UserRole } from "@/types";

export const dynamic = "force-dynamic";

// PATCH /api/users/:userId — admin-only role updates.
export async function PATCH(
  req: Request,
  { params }: { params: { userId: string } },
) {
  const ctx = await requireRole(["admin"]);
  if (ctx instanceof Response) return ctx;

  let body: { role?: UserRole };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  if (!isUserRole(body.role)) return badRequest("role must be pm, se, or admin");

  try {
    const target = await prisma.user.findUnique({ where: { id: params.userId } });
    if (!target) return notFound("User not found");

    if (target.role === "admin" && body.role !== "admin") {
      const adminCount = await prisma.user.count({ where: { role: "admin" } });
      if (adminCount <= 1) {
        return badRequest("At least one admin is required.");
      }
    }

    const user = await prisma.user.update({
      where: { id: params.userId },
      data: { role: body.role },
    });

    return json({ user: serializeUser(user) });
  } catch (err) {
    return serverError((err as Error).message);
  }
}
