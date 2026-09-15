import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getProvider } from "@/lib/ai/registry";
import { getAISettings } from "@/lib/ai/config";
import {
  createTaskWorktree,
  removeTaskWorktree,
  assertWorktreePath,
} from "@/lib/workspace/config";
import { readRepoFiles } from "@/lib/workspace/files";
import { applyPatches, type StoredPatch } from "@/lib/patches";
import { diffFromPatches, patchesFromWorktreeVsBase } from "@/lib/git/diff";
import { gitClient } from "@/lib/git/client";
import { buildChatUserMessage } from "@/lib/ai/prompts";
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

/** Fail a stranded chat run (process died mid-turn) without touching the session worktree. */
export async function markChatRunInterrupted(runId: string): Promise<void> {
  const run = await prisma.executionRun.findUnique({ where: { id: runId } });
  if (!run || TERMINAL_STATUSES.has(run.status)) return;

  const message = "The chat turn was interrupted before it finished. Send your message again.";
  if (run.chatSessionId) {
    const placeholder = await prisma.chatMessage.findFirst({
      where: { chatSessionId: run.chatSessionId, runId, role: "assistant" },
    });
    if (placeholder) {
      await prisma.chatMessage
        .update({ where: { id: placeholder.id }, data: { content: `⚠️ ${message}` } })
        .catch(() => {});
    }
  }
  await appendRunEvent(runId, { type: "error", message }).catch(() => {});
  await finishRun(runId, "failed", { error: message }).catch(() => {});
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

// ─────────────────────────────────────────────────────────────────────────────
// Chat turns — agentic conversation that accumulates edits in a per-session
// worktree and upserts a single evolving Result into the review queue.
// ─────────────────────────────────────────────────────────────────────────────

/** For patch-mode providers, drop the trailing JSON file block from the chat reply. */
function chatAssistantText(rawText: string, mode: "patch" | "apply"): string {
  if (mode !== "patch") return rawText.trim();
  const fenceIdx = rawText.search(/```(?:json)?\s*\{/i);
  const text = fenceIdx >= 0 ? rawText.slice(0, fenceIdx) : rawText;
  return text.trim() || "Done — see the diff.";
}

export function startChatTurn(runId: string, accessToken: string): void {
  const active = activeRuns();
  if (active.has(runId)) return;

  active.add(runId);
  void runChatTurn(runId, accessToken).finally(() => {
    active.delete(runId);
  });
}

async function runChatTurn(runId: string, accessToken: string): Promise<void> {
  const run = await prisma.executionRun.findUnique({
    where: { id: runId },
    include: { task: true, chatSession: true },
  });
  if (!run || TERMINAL_STATUSES.has(run.status) || !run.chatSession) return;

  const task = run.task;
  const session = run.chatSession;
  const mode = run.mode as Mode;

  // The POST route created an empty assistant message tagged with this run.
  const placeholder = await prisma.chatMessage.findFirst({
    where: { chatSessionId: session.id, runId, role: "assistant" },
  });

  try {
    await prisma.executionRun.update({
      where: { id: runId },
      data: { status: "running", startedAt: new Date() },
    });

    // Resolve the session's persistent worktree; create it (and record the base
    // commit) on first use. NEVER recreate or remove it between turns.
    let root = session.worktreePath;
    let baseSha = session.baseSha;
    if (root) {
      try {
        root = await assertWorktreePath(root);
      } catch {
        root = null;
      }
    }
    if (!root || !baseSha) {
      await appendRunEvent(runId, {
        type: "status",
        message: `Preparing chat worktree for ${task.repoFullName} on ${task.branchName}...`,
      });
      root = await createTaskWorktree(task.repoFullName, task.branchName, task.id, accessToken);
      baseSha = (await gitClient(root).revparse(["HEAD"])).trim();
      await prisma.chatSession.update({
        where: { id: session.id },
        data: { worktreePath: root, baseSha },
      });
    }

    const settings = await getAISettings();
    const provider = await getProvider(settings);

    // Conversation history (excludes the empty placeholder we just created).
    const messages = await prisma.chatMessage.findMany({
      where: { chatSessionId: session.id },
      orderBy: { createdAt: "asc" },
    });
    const history = messages
      .filter((m) => m.id !== placeholder?.id && m.content.trim().length > 0)
      .map((m) => ({ role: m.role, content: m.content }));

    // Task activity trail (runs, reviews, PRs, …) so the engineer knows what
    // has already happened on this task, not just the chat.
    const activity = await prisma.activityEvent.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: "asc" },
      select: { kind: true, actorMode: true, detail: true, createdAt: true },
    });

    let files: FileContext[] = [];
    if (provider.mode === "patch") {
      const read = await readRepoFiles(root);
      files = read.files;
    }

    const effortLabel = settings.effort ? `, ${settings.effort}` : "";
    await appendRunEvent(runId, {
      type: "status",
      message: `Running ${settings.provider} (${settings.model}${effortLabel})...`,
    });

    const aiReq: AIRequest = {
      prompt: buildChatUserMessage(
        history,
        {
          title: task.title,
          prompt: task.prompt,
          repoFullName: task.repoFullName,
        },
        activity,
      ),
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

    // Patch-mode providers don't touch the tree — apply their changes first so the
    // cumulative diff below reflects them.
    if (provider.mode === "patch" && aiResponse.patches.length > 0) {
      await applyPatches(root, aiResponse.patches);
    }

    const assistantText = chatAssistantText(aiResponse.rawText, provider.mode);
    const cumulative = await patchesFromWorktreeVsBase(root, baseSha);

    let resultId = session.resultId ?? "";
    if (cumulative.length > 0) {
      const stored: StoredPatch[] = cumulative.map((p) => ({
        ...p,
        created: p.originalContent === "",
      }));
      const diffJson = JSON.stringify(diffFromPatches(cumulative));
      const patchesJson = JSON.stringify(stored);

      if (session.resultId) {
        // Only re-open review if the diff actually changed — a purely
        // conversational turn shouldn't knock an approved result back to pending.
        const existing = await prisma.result.findUnique({
          where: { id: session.resultId },
          select: { diffJson: true },
        });
        const changed = !existing || existing.diffJson !== diffJson;
        await prisma.result.update({
          where: { id: session.resultId },
          data: {
            patchesJson,
            diffJson,
            rawText: assistantText,
            worktreePath: root,
            ...(changed ? { reviewStatus: "pending" } : {}),
          },
        });
        resultId = session.resultId;
      } else {
        const result = await prisma.result.create({
          data: {
            taskId: task.id,
            origin: "chat",
            chatSessionId: session.id,
            executedBy: mode,
            reviewStatus: "pending",
            patchesJson,
            diffJson,
            rawText: assistantText,
            worktreePath: root,
          },
        });
        resultId = result.id;
        await prisma.chatSession.update({
          where: { id: session.id },
          data: { resultId },
        });
      }
    }

    if (placeholder) {
      await prisma.chatMessage.update({
        where: { id: placeholder.id },
        data: { content: assistantText, resultId: resultId || null },
      });
    }

    await appendRunEvent(runId, { type: "done", resultId });
    await finishRun(runId, "succeeded", { resultId: resultId || undefined });
  } catch (err) {
    const message = (err as Error).message;
    // Fail only the run — keep the session worktree so accumulated edits survive.
    if (placeholder) {
      await prisma.chatMessage
        .update({
          where: { id: placeholder.id },
          data: { content: `⚠️ ${message}` },
        })
        .catch(() => {});
    }
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
