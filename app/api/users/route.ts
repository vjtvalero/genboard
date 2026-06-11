import { json, requireRole } from "@/lib/api";
import { prisma } from "@/lib/db";
import { serializeUser } from "@/lib/users";

export const dynamic = "force-dynamic";

// GET /api/users — admin-only user list for role assignment.
export async function GET() {
  const ctx = await requireRole(["admin"]);
  if (ctx instanceof Response) return ctx;

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { githubLogin: "asc" }],
  });

  return json({
    currentUser: serializeUser(ctx.user),
    users: users.map(serializeUser),
  });
}
