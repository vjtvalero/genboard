"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Mode, Priority, TaskStatus } from "@/types";
import { STATUS_CLASS, STATUS_LABEL, PRIORITY_CLASS } from "@/lib/labels";

interface TaskNav {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
}

export default function Sidebar({
  tasks,
  selectedRepo,
  mode,
}: {
  tasks: TaskNav[];
  selectedRepo: string | null;
  mode: Mode;
}) {
  const pathname = usePathname();

  if (!selectedRepo) {
    return (
      <div className="p-4 text-sm text-neutral-500">
        Select a repository to see its tasks.
      </div>
    );
  }

  return (
    <nav className="p-2">
      <div className="flex items-center justify-between px-2 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {mode === "se" ? "Review Queue" : "Backlog"}
        </span>
        <Link
          href={mode === "se" ? "/tasks?view=review" : "/tasks"}
          className="text-xs text-neutral-400 hover:text-neutral-100"
        >
          Board →
        </Link>
      </div>

      {tasks.length === 0 ? (
        <p className="px-2 py-3 text-sm text-neutral-500">No tasks yet.</p>
      ) : (
        <ul className="space-y-0.5">
          {tasks.map((t) => {
            const active = pathname.startsWith(`/tasks/${t.id}`);
            return (
              <li key={t.id}>
                <Link
                  href={`/tasks/${t.id}`}
                  className={
                    "block rounded-md px-2 py-2 text-sm transition " +
                    (active ? "bg-neutral-800 text-neutral-100" : "text-neutral-300 hover:bg-neutral-800/60")
                  }
                >
                  <div className="truncate font-medium">{t.title}</div>
                  <div className="mt-1 flex items-center gap-1">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${STATUS_CLASS[t.status]}`}>
                      {STATUS_LABEL[t.status]}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${PRIORITY_CLASS[t.priority]}`}>
                      {t.priority}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
