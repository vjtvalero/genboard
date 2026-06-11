"use client";

import Link from "next/link";
import type { TaskCard, TaskStatus } from "@/types";
import { STATUS_CLASS, STATUS_LABEL, PRIORITY_CLASS } from "@/lib/labels";

const REVIEW_STATUSES: TaskStatus[] = [
  "in_review",
  "executed",
  "changes_requested",
  "approved",
  "pr_opened",
  "pushed",
];

export default function ReviewQueue({ tasks, repo }: { tasks: TaskCard[]; repo: string }) {
  const queue = tasks
    .filter((t) => REVIEW_STATUSES.includes(t.status))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Review Queue</h1>
        <p className="text-sm text-neutral-500">{repo}</p>
      </div>

      {queue.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-800 p-10 text-center text-neutral-500">
          Nothing to review yet. Runs that finish executing appear here.
        </div>
      ) : (
        <ul className="space-y-2">
          {queue.map((t) => {
            const target = t.latestResultId
              ? `/tasks/${t.id}/diff`
              : `/tasks/${t.id}`;
            return (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-3"
              >
                <div className="min-w-0 flex-1">
                  <Link href={`/tasks/${t.id}`} className="font-medium hover:underline">
                    {t.title}
                  </Link>
                  <p className="mt-0.5 line-clamp-1 text-sm text-neutral-500">{t.prompt}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-[11px] ${STATUS_CLASS[t.status]}`}>
                      {STATUS_LABEL[t.status]}
                    </span>
                    <span className={`rounded px-2 py-0.5 text-[11px] ${PRIORITY_CLASS[t.priority]}`}>
                      {t.priority}
                    </span>
                  </div>
                </div>
                <Link
                  href={target}
                  className="accent-bg shrink-0 rounded-md px-3 py-1.5 text-sm font-medium text-white"
                >
                  Review →
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
