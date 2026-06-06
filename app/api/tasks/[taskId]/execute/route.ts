import { getSession, unauthorized, notFound, badRequest } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getMode, isMode } from "@/lib/mode";
import { logActivity } from "@/lib/activity";
import { getProvider } from "@/lib/ai/registry";
import { getAISettings } from "@/lib/ai/config";
import { getWorkspacePath } from "@/lib/workspace/config";
import { validateRepoPath } from "@/lib/git/validate";
import { readRepoFiles } from "@/lib/workspace/files";
import { applyPatches, type StoredPatch } from "@/lib/patches";
import { diffFromPatches } from "@/lib/git/diff";
import { sseResponse } from "@/lib/sse";
import type { AIRequest, FileContext, Mode, StreamEvent } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/tasks/[taskId]/execute — SSE stream of AI tokens; applies patches.
export async function POST(req: Request, { params }: { params: { taskId: string } }) {
  const session = await getSession();
  if (!session) return unauthorized();

  const task = await prisma.task.findUnique({ where: { id: params.taskId } });
  if (!task) return notFound("Task not found");

  let mode: Mode = getMode();
  try {
    const body = await req.json();
    if (isMode(body?.mode)) mode = body.mode;
  } catch {
    // no body / not JSON — use cookie mode
  }

  const localPath = await getWorkspacePath(task.repoFullName);
  if (!localPath) {
    return badRequest(
      `No local workspace linked for ${task.repoFullName}. Link it on the Settings page.`,
    );
  }

  async function* run(): AsyncGenerator<StreamEvent, void, unknown> {
    try {
      const check = await validateRepoPath(localPath!);
      if (!check.ok || !check.absPath) {
        yield { type: "error", message: check.reason ?? "Invalid repo path" };
        return;
      }
      const root = check.absPath;

      const settings = await getAISettings();
      const provider = await getProvider(settings);

      // "apply"-mode CLIs read the repo themselves; only "patch" providers need
      // the file context bundled into the prompt.
      let files: FileContext[] = [];
      if (provider.mode === "patch") {
        yield { type: "status", message: `Reading files from ${task!.repoFullName}…` };
        const read = await readRepoFiles(root);
        files = read.files;
        if (read.truncated) {
          yield { type: "status", message: `(file context truncated to ${files.length} files)` };
        }
      }

      await prisma.task.update({ where: { id: task!.id }, data: { status: "running" } });
      const effortLabel = settings.effort ? `, ${settings.effort}` : "";
      yield {
        type: "status",
        message: `Running ${settings.provider} (${settings.model}${effortLabel})…`,
      };

      const aiReq: AIRequest = {
        prompt: task!.prompt,
        repoFullName: task!.repoFullName,
        files,
        repoPath: root,
      };

      const gen = provider.execute(aiReq);
      let step = await gen.next();
      while (!step.done) {
        yield { type: "token", text: step.value };
        step = await gen.next();
      }
      const aiResponse = step.value;

      if (aiResponse.patches.length === 0) {
        await prisma.task.update({ where: { id: task!.id }, data: { status: "failed" } });
        await logActivity(task!.id, "failed", mode, "AI returned no file changes");
        yield { type: "error", message: "AI made no file changes." };
        return;
      }

      let stored: StoredPatch[];
      if (provider.mode === "apply") {
        // The CLI already wrote the changes; record originals captured from the
        // pre-run git snapshot (no second write).
        stored = aiResponse.patches.map((p) => ({
          ...p,
          created: p.originalContent === "",
        }));
      } else {
        yield { type: "status", message: `Applying ${aiResponse.patches.length} file change(s)…` };
        stored = await applyPatches(root, aiResponse.patches);
      }
      const diff = diffFromPatches(stored);

      const result = await prisma.result.create({
        data: {
          taskId: task!.id,
          patchesJson: JSON.stringify(stored),
          diffJson: JSON.stringify(diff),
          executedBy: mode,
          reviewStatus: "pending",
          rawText: aiResponse.rawText,
        },
      });

      await prisma.task.update({
        where: { id: task!.id },
        data: { status: "in_review", latestResultId: result.id },
      });
      await logActivity(
        task!.id,
        "executed",
        mode,
        `${stored.length} file(s) changed → in review`,
      );

      yield { type: "done", resultId: result.id };
    } catch (err) {
      await prisma.task
        .update({ where: { id: task!.id }, data: { status: "failed" } })
        .catch(() => {});
      await logActivity(task!.id, "failed", mode, (err as Error).message).catch(() => {});
      yield { type: "error", message: (err as Error).message };
    }
  }

  return sseResponse(run());
}
