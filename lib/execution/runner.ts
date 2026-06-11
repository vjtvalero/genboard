import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getProvider } from "@/lib/ai/registry";
import { getAISettings } from "@/lib/ai/config";
import { createTaskWorktree, removeTaskWorktree } from "@/lib/workspace/config";
import { readRepoFiles } from "@/lib/workspace/files";
import { applyPatches, type StoredPatch } from "@/lib/patches";
import { diffFromPatches } from "@/lib/git/diff";
import type { AIRequest, FileContext, Mode, StreamEvent } from "@/types";

const TERMINAL_STATUSES = new Set(["succeeded", "failed"]);

const globalForExecution = globalThis as unknown as {
  genboardActiveExecutionRuns?: Set<string>;
};

function activeRuns(): Set<string> {
  if (!globalForExecution.genboardActiveExecutionRuns) {
    globalForExecution.genboardActiveExecutionRuns = new Set<string>();
  }
  return globalForExecution.genboardActiveExecutionRuns;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isExecutionRunActive(runId: string): boolean {
  return activeRuns().has(runId);
}

async function appendRunEvent(runId: string, event: StreamEvent): Promise<void> {
  const max = await prisma.executionLog.aggregate({
    where: { runId },
    _max: { seq: true },
  });
  await prisma.executionLog.create({
    data: {
      runId,
      seq: (max._max.seq ?? -1) + 1,
      type: event.type,
      eventJson: JSON.stringify(event),
    },
  });
}

async function finishRun(
  runId: string,
  status: "succeeded" | "failed",
  data: { resultId?: string; error?: string } = {},
): Promise<void> {
  await prisma.executionRun.update({
    where: { id: runId },
    data: {
      status,
      resultId: data.resultId,
      error: data.error,
      finishedAt: new Date(),
    },
  });
}

export async function markExecutionRunInterrupted(runId: string): Promise<void> {
  const run = await prisma.executionRun.findUnique({
    where: { id: runId },
    include: { task: true },
  });
  if (!run || TERMINAL_STATUSES.has(run.status)) return;

  const message = "Execution was interrupted before the local process finished. Re-execute the task.";
  await appendRunEvent(runId, { type: "error", message });
  await finishRun(runId, "failed", { error: message });
  await prisma.task
    .update({ where: { id: run.taskId }, data: { status: "failed" } })
    .catch(() => {});
  await logActivity(run.taskId, "failed", run.mode as Mode, message, run.userId).catch(() => {});
}

export function startExecutionRun(runId: string, accessToken: string): void {
  const active = activeRuns();
  if (active.has(runId)) return;

  active.add(runId);
  void runExecutionRun(runId, accessToken).finally(() => {
    active.delete(runId);
  });
}

async function runExecutionRun(runId: string, accessToken: string): Promise<void> {
  const run = await prisma.executionRun.findUnique({
    where: { id: runId },
    include: { task: true },
  });
  if (!run || TERMINAL_STATUSES.has(run.status)) return;

  const task = run.task;
  const mode = run.mode as Mode;
  const userId = run.userId;
  let root: string | null = null;
  let resultCreated = false;

  try {
    await prisma.executionRun.update({
      where: { id: runId },
      data: { status: "running", startedAt: new Date() },
    });
    await prisma.task.update({ where: { id: task.id }, data: { status: "running" } });

    await appendRunEvent(runId, {
      type: "status",
      message: `Preparing isolated worktree for ${task.repoFullName} on ${task.branchName}...`,
    });
    root = await createTaskWorktree(task.repoFullName, task.branchName, task.id, accessToken);

    const settings = await getAISettings();
    const provider = await getProvider(settings);

    let files: FileContext[] = [];
    if (provider.mode === "patch") {
      await appendRunEvent(runId, {
        type: "status",
        message: `Reading files from ${task.repoFullName}...`,
      });
      const read = await readRepoFiles(root);
      files = read.files;
      if (read.truncated) {
        await appendRunEvent(runId, {
          type: "status",
          message: `(file context truncated to ${files.length} files)`,
        });
      }
    }

    const effortLabel = settings.effort ? `, ${settings.effort}` : "";
    await appendRunEvent(runId, {
      type: "status",
      message: `Running ${settings.provider} (${settings.model}${effortLabel})...`,
    });

    const aiReq: AIRequest = {
      prompt: task.prompt,
      repoFullName: task.repoFullName,
      files,
      repoPath: root,
    };

    const gen = provider.execute(aiReq);
    let step = await gen.next();
    while (!step.done) {
      await appendRunEvent(runId, { type: "token", text: step.value });
      step = await gen.next();
    }
    const aiResponse = step.value;

    if (aiResponse.patches.length === 0) {
      await removeTaskWorktree(task.repoFullName, root);
      await prisma.task.update({ where: { id: task.id }, data: { status: "failed" } });
      await logActivity(task.id, "failed", mode, "AI returned no file changes", userId);
      await appendRunEvent(runId, { type: "error", message: "AI made no file changes." });
      await finishRun(runId, "failed", { error: "AI made no file changes." });
      return;
    }

    let stored: StoredPatch[];
    if (provider.mode === "apply") {
      stored = aiResponse.patches.map((p) => ({
        ...p,
        created: p.originalContent === "",
      }));
    } else {
      await appendRunEvent(runId, {
        type: "status",
        message: `Applying ${aiResponse.patches.length} file change(s)...`,
      });
      stored = await applyPatches(root, aiResponse.patches);
    }
    const diff = diffFromPatches(stored);

    const result = await prisma.result.create({
      data: {
        taskId: task.id,
        patchesJson: JSON.stringify(stored),
        diffJson: JSON.stringify(diff),
        executedBy: mode,
        reviewStatus: "pending",
        rawText: aiResponse.rawText,
        worktreePath: root,
      },
    });
    resultCreated = true;

    await prisma.task.update({
      where: { id: task.id },
      data: { status: "in_review", latestResultId: result.id },
    });
    await logActivity(
      task.id,
      "executed",
      mode,
      `${stored.length} file(s) changed -> in review`,
      userId,
    );
    await appendRunEvent(runId, { type: "done", resultId: result.id });
    await finishRun(runId, "succeeded", { resultId: result.id });
  } catch (err) {
    const message = (err as Error).message;
    if (root && !resultCreated) {
      await removeTaskWorktree(task.repoFullName, root).catch(() => {});
    }
    await prisma.task.update({ where: { id: task.id }, data: { status: "failed" } }).catch(() => {});
    await logActivity(task.id, "failed", mode, message, userId).catch(() => {});
    await appendRunEvent(runId, { type: "error", message }).catch(() => {});
    await finishRun(runId, "failed", { error: message }).catch(() => {});
  }
}

export async function* streamExecutionRun(runId: string): AsyncGenerator<StreamEvent, void, unknown> {
  let lastSeq = -1;

  while (true) {
    const logs = await prisma.executionLog.findMany({
      where: { runId, seq: { gt: lastSeq } },
      orderBy: { seq: "asc" },
    });

    for (const log of logs) {
      lastSeq = log.seq;
      try {
        yield JSON.parse(log.eventJson) as StreamEvent;
      } catch {
        /* ignore corrupted log rows */
      }
    }

    const run = await prisma.executionRun.findUnique({
      where: { id: runId },
      select: { status: true },
    });
    if (!run || (TERMINAL_STATUSES.has(run.status) && logs.length === 0)) {
      return;
    }

    await sleep(500);
  }
}
