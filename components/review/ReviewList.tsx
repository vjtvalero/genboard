import Link from "next/link";
import type { ReviewQueueItem } from "@/types";
import {
  REVIEW_STATUS_CLASS,
  REVIEW_STATUS_LABEL,
  ORIGIN_CLASS,
  ORIGIN_LABEL,
} from "@/lib/labels";

export default function ReviewList({
  items,
  repo,
}: {
  items: ReviewQueueItem[];
  repo: string;
}) {
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Review Queue</h1>
        <p className="text-sm text-neutral-500">{repo}</p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-800 p-10 text-center text-neutral-500">
          Nothing to review yet. Diffs from task runs and chats appear here as they are
          produced, and drop off once merged.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/tasks/${it.taskId}`}
                    className="truncate font-medium hover:underline"
                  >
                    {it.taskTitle}
                  </Link>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${ORIGIN_CLASS[it.origin]}`}>
                    {ORIGIN_LABEL[it.origin]}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-1 text-sm text-neutral-500">{it.taskPrompt}</p>
                <div className="mt-2 flex items-center gap-2 text-[11px]">
                  <span className={`rounded px-2 py-0.5 ${REVIEW_STATUS_CLASS[it.reviewStatus]}`}>
                    {REVIEW_STATUS_LABEL[it.reviewStatus]}
                  </span>
                  <span className="text-neutral-500">
                    {it.fileCount} file{it.fileCount === 1 ? "" : "s"}
                  </span>
                  <span className="text-emerald-400">+{it.additions}</span>
                  <span className="text-rose-400">−{it.deletions}</span>
                  {it.prNumber != null && (
                    <span className="rounded bg-emerald-600/30 px-2 py-0.5 text-emerald-200">
                      PR #{it.prNumber}
                    </span>
                  )}
                </div>
              </div>
              <Link
                href={`/results/${it.id}`}
                className="accent-bg shrink-0 rounded-md px-3 py-1.5 text-sm font-medium text-white"
              >
                Review →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
