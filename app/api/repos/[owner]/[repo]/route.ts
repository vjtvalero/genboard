import { badRequest, json, notFound, requireRole, serverError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { serializeRepository } from "@/lib/repositories";

export const dynamic = "force-dynamic";

// PATCH /api/repos/:owner/:repo — admin enables/disables a managed repository.
export async function PATCH(
  req: Request,
  { params }: { params: { owner: string; repo: string } },
) {
  const ctx = await requireRole(["admin"]);
  if (ctx instanceof Response) return ctx;

  let body: { enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (typeof body.enabled !== "boolean") return badRequest("enabled is required");

  const repoFullName = `${decodeURIComponent(params.owner)}/${decodeURIComponent(params.repo)}`;
  try {
    const existing = await prisma.repository.findUnique({
      where: { fullName: repoFullName },
    });
    if (!existing) return notFound("Repository is not managed by Genboard");

    const repository = await prisma.repository.update({
      where: { id: existing.id },
      data: { enabled: body.enabled },
    });
    return json({ repository: serializeRepository(repository) });
  } catch (err) {
    return serverError((err as Error).message);
  }
}
