"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Priority, TaskCard, TaskStatus } from "@/types";
import {
  STATUS_CLASS,
  STATUS_LABEL,
  PRIORITY_CLASS,
  ALL_PRIORITIES,
} from "@/lib/labels";
import CreateTaskModal from "./CreateTaskModal";

const GROUPS: { key: string; label: string; statuses: TaskStatus[] }[] = [
  { key: "backlog", label: "Backlog", statuses: ["backlog"] },
  { key: "attention", label: "Needs Attention", statuses: ["changes_requested", "failed"] },
  { key: "active", label: "In Progress", statuses: ["running", "executed", "in_review"] },
  { key: "done", label: "Done", statuses: ["approved", "pushed"] },
];

export default function TaskList({ tasks, repo }: { tasks: TaskCard[]; repo: string }) {
  const router = useRouter();
  const [items, setItems] = useState<TaskCard[]>(tasks);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);

  function group(statuses: TaskStatus[]) {
    return items.filter((t) => statuses.includes(t.status));
  }

  async function persistOrder(next: TaskCard[]) {
    setItems(next);
    setBusy(true);
    try {
      await fetch("/api/tasks/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: next.map((t) => t.id) }),
      });
    } finally {
      setBusy(false);
    }
  }

  // Move a backlog item up/down relative to its backlog neighbors.
  function moveBacklog(id: string, dir: -1 | 1) {
    const backlog = group(["backlog"]);
    const idx = backlog.findIndex((t) => t.id === id);
    const swapWith = backlog[idx + dir];
    if (!swapWith) return;

    const next = [...items];
    const a = next.findIndex((t) => t.id === id);
    const b = next.findIndex((t) => t.id === swapWith.id);
    [next[a], next[b]] = [next[b], next[a]];
    persistOrder(next);
  }

  async function changePriority(id: string, priority: Priority) {
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, priority } : t)));
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priority }),
    });
    router.refresh();
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Backlog</h1>
          <p className="text-sm text-neutral-500">{repo}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="accent-bg rounded-lg px-4 py-2 text-sm font-medium text-white"
        >
          + New Task
        </button>
      </div>

      {items.length === 0 && (
        <div className="rounded-lg border border-dashed border-neutral-800 p-10 text-center text-neutral-500">
          No tasks yet. Create your first task to get started.
        </div>
      )}

      <div className="space-y-6">
        {GROUPS.map(({ key, label, statuses }) => {
          const groupTasks = group(statuses);
          if (groupTasks.length === 0) return null;
          const reorderable = key === "backlog";
          return (
            <section key={key}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {label} <span className="text-neutral-600">({groupTasks.length})</span>
              </h2>
              <ul className="space-y-2">
                {groupTasks.map((t, i) => (
                  <li
                    key={t.id}
                    className="flex items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-3"
                  >
                    {reorderable && (
                      <div className="flex flex-col">
                        <button
                          disabled={i === 0 || busy}
                          onClick={() => moveBacklog(t.id, -1)}
                          className="px-1 text-neutral-500 hover:text-neutral-200 disabled:opacity-30"
                          aria-label="Move up"
                        >
                          ▲
                        </button>
                        <button
                          disabled={i === groupTasks.length - 1 || busy}
                          onClick={() => moveBacklog(t.id, 1)}
                          className="px-1 text-neutral-500 hover:text-neutral-200 disabled:opacity-30"
                          aria-label="Move down"
                        >
                          ▼
                        </button>
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <Link href={`/tasks/${t.id}`} className="font-medium hover:underline">
                        {t.title}
                      </Link>
                      <p className="mt-0.5 line-clamp-2 text-sm text-neutral-500">{t.prompt}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className={`rounded px-2 py-0.5 text-[11px] ${STATUS_CLASS[t.status]}`}>
                          {STATUS_LABEL[t.status]}
                        </span>
                        <select
                          value={t.priority}
                          onChange={(e) => changePriority(t.id, e.target.value as Priority)}
                          className={`rounded px-1.5 py-0.5 text-[11px] ${PRIORITY_CLASS[t.priority]} border-0 focus:outline-none`}
                        >
                          {ALL_PRIORITIES.map((p) => (
                            <option key={p} value={p} className="bg-neutral-900 text-neutral-100">
                              {p}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <Link
                      href={`/tasks/${t.id}`}
                      className="shrink-0 rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
                    >
                      Open →
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {showCreate && <CreateTaskModal repo={repo} onClose={() => setShowCreate(false)} />}
    </div>
  );
}
