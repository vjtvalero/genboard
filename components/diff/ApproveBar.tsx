"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ReviewStatus } from "@/types";

export default function ApproveBar({
  resultId,
  taskTitle,
  reviewStatus,
  initialCommitSha,
  initialPrNumber,
  initialPrUrl,
  prMerged = false,
}: {
  resultId: string;
  taskTitle: string;
  reviewStatus: ReviewStatus;
  initialCommitSha: string | null;
  initialPrNumber: number | null;
  initialPrUrl: string | null;
  prMerged?: boolean;
}) {
  const router = useRouter();
  const [commitMessage, setCommitMessage] = useState(`genboard: ${taskTitle}`);
  const [pushing, setPushing] = useState(false);
  const [commitSha, setCommitSha] = useState<string | null>(initialCommitSha);
  const [prNumber, setPrNumber] = useState<number | null>(initialPrNumber);
  const [prUrl, setPrUrl] = useState<string | null>(initialPrUrl);
  const [error, setError] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState(false);

  const approved = reviewStatus === "approved";
  const opened = !!prUrl;

  async function openPullRequest() {
    setError(null);
    setPushing(true);
    try {
      const res = await fetch(`/api/results/${resultId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commitMessage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "PR creation failed");
      setCommitSha(data.commitSha);
      setPrNumber(data.prNumber ?? null);
      setPrUrl(data.prUrl ?? null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPushing(false);
    }
  }

  async function rollback() {
    if (!confirm("Restore the original files and discard these changes?")) return;
    setError(null);
    setRollingBack(true);
    try {
      const res = await fetch(`/api/results/${resultId}/rollback`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Rollback failed");
      router.push(`/tasks`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRollingBack(false);
    }
  }

  if (opened) {
    const tone = prMerged
      ? "border-purple-600/50 bg-purple-900/20"
      : "border-emerald-700/50 bg-emerald-900/20";
    const headTone = prMerged ? "text-purple-300" : "text-emerald-300";
    const linkTone = prMerged ? "text-purple-400" : "text-emerald-400";
    return (
      <div className={`rounded-lg border p-4 ${tone}`}>
        <div className={`text-sm font-medium ${headTone}`}>
          {prMerged ? "Pull request merged ✓" : "Pull request opened"}
        </div>
        {prMerged && (
          <p className="mt-1 text-xs text-neutral-400">
            This task is complete — the PR has been merged on GitHub.
          </p>
        )}
        <a
          href={prUrl}
          target="_blank"
          rel="noreferrer"
          className={`mt-1 inline-block font-mono text-xs underline ${linkTone}`}
        >
          #{prNumber ?? "PR"} — view on GitHub →
        </a>
        {commitSha && (
          <div className="mt-1 font-mono text-[11px] text-neutral-500">
            {commitSha.slice(0, 10)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <h3 className="text-sm font-semibold">Approve &amp; Open PR</h3>
      {!approved && (
        <p className="mt-1 text-xs text-amber-400">
          PR creation is gated: a Senior Engineer must approve this result first.
        </p>
      )}
      <input
        value={commitMessage}
        onChange={(e) => setCommitMessage(e.target.value)}
        className="mt-3 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-500"
      />
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          onClick={openPullRequest}
          disabled={!approved || pushing}
          className="flex-1 accent-bg rounded-md px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          title={approved ? "" : "Requires SE approval"}
        >
          {pushing ? "Opening..." : "Open PR"}
        </button>
        <button
          onClick={rollback}
          disabled={rollingBack}
          className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
        >
          {rollingBack ? "…" : "Rollback"}
        </button>
      </div>
    </div>
  );
}
