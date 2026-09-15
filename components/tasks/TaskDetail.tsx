"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Mode, Priority, TaskStatus } from "@/types";
import { STATUS_CLASS, STATUS_LABEL, PRIORITY_CLASS, MODE_SHORT } from "@/lib/labels";
import { readSSE } from "@/lib/stream-client";
import ActivityTrail, { type ActivityEventClient } from "./ActivityTrail";
import ChatTab from "@/components/chat/ChatTab";

interface TaskProp {
  id: string;
  repoFullName: string;
  branchName: string;
  title: string;
  prompt: string;
  status: TaskStatus;
  priority: Priority;
  latestResultId: string | null;
}

export default function TaskDetail({
  mode,
  task,
  events,
}: {
  mode: Mode;
  task: TaskProp;
  events: ActivityEventClient[];
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState(task.prompt);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [stream, setStream] = useState("");
  const [resultId, setResultId] = useState<string | null>(task.latestResultId);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"output" | "chat">("output");
  const termRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    termRef.current?.scrollTo({ top: termRef.current.scrollHeight });
  }, [stream]);

  useEffect(() => {
    if (task.status !== "running") return;
    let cancelled = false;
    setExecuting(true);
    setStream("");

    readSSE(
      `/api/tasks/${task.id}/execute`,
      null,
      (e) => {
        if (cancelled) return;
        if (e.type === "token") setStream((s) => s + e.text);
        else if (e.type === "status") setStream((s) => s + `\n[ ${e.message} ]\n`);
        else if (e.type === "done") {
          setResultId(e.resultId);
          setStatus("in_review");
          setStream((s) => s + `\n[ ✓ done — result ${e.resultId} ]\n`);
        } else if (e.type === "error") {
          setError(e.message);
          setStatus("failed");
          setStream((s) => s + `\n[ ✗ error: ${e.message} ]\n`);
        }
      },
      { method: "GET" },
    ).finally(() => {
      if (!cancelled) {
        setExecuting(false);
        router.refresh();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [router, task.id, task.status]);

  const dirty = prompt !== task.prompt;

  async function savePrompt() {
    setSaving(true);
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function execute() {
    setError(null);
    setStream("");
    setExecuting(true);
    setStatus("running");
    if (dirty) await savePrompt();

    await readSSE(`/api/tasks/${task.id}/execute`, { mode }, (e) => {
      if (e.type === "token") setStream((s) => s + e.text);
      else if (e.type === "status") setStream((s) => s + `\n[ ${e.message} ]\n`);
      else if (e.type === "done") {
        setResultId(e.resultId);
        setStatus("in_review");
        setStream((s) => s + `\n[ ✓ done — result ${e.resultId} ]\n`);
      } else if (e.type === "error") {
        setError(e.message);
        setStatus("failed");
        setStream((s) => s + `\n[ ✗ error: ${e.message} ]\n`);
      }
    });

    setExecuting(false);
    router.refresh();
  }

  const canViewDiff = !!resultId && status !== "running";

  return (
    <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2 text-xs text-neutral-500">
          <Link href="/tasks" className="hover:text-neutral-300">
            ← Board
          </Link>
          <span>·</span>
          <span>{task.repoFullName}</span>
          <span>·</span>
          <span>{task.branchName}</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-semibold">{task.title}</h1>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-[11px] ${STATUS_CLASS[status]}`}>
              {STATUS_LABEL[status]}
            </span>
            <span className={`rounded px-2 py-0.5 text-[11px] ${PRIORITY_CLASS[task.priority]}`}>
              {task.priority}
            </span>
          </div>
        </div>

        <div className="mt-5 flex gap-1 border-b border-neutral-800">
          {(["output", "chat"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition " +
                (tab === t
                  ? "accent-text border-current"
                  : "border-transparent text-neutral-400 hover:text-neutral-200")
              }
            >
              {t === "output" ? "Output" : "Chat"}
            </button>
          ))}
        </div>

        {tab === "chat" ? (
          <div className="mt-4">
            <ChatTab taskId={task.id} />
          </div>
        ) : (
        <>
        <label className="mt-4 block text-sm font-medium text-neutral-300">Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={5}
          className="mt-1 w-full resize-y rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-500"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={execute}
            disabled={executing}
            className="accent-bg rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {executing
              ? "Executing…"
              : resultId
                ? `Re-execute as ${MODE_SHORT[mode]}`
                : `Execute as ${MODE_SHORT[mode]}`}
          </button>
          {dirty && (
            <button
              onClick={savePrompt}
              disabled={saving}
              className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save prompt"}
            </button>
          )}
          {canViewDiff && resultId && (
            <Link
              href={`/results/${resultId}`}
              className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
            >
              View Diff →
            </Link>
          )}
        </div>

        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

        {(stream || executing) && (
          <div className="mt-4">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Engineer output
            </div>
            <pre
              ref={termRef}
              className="terminal h-80 overflow-y-auto rounded-lg border border-neutral-800 bg-black p-3 text-neutral-200"
            >
              {stream || "…"}
            </pre>
          </div>
        )}
        </>
        )}
      </div>

      <aside className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        <ActivityTrail taskId={task.id} events={events} />
      </aside>
    </div>
  );
}
