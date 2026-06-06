"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AIReview, ReviewComment, ReviewDecision, ReviewStatus } from "@/types";
import { readSSE } from "@/lib/stream-client";

const SEVERITY_CLASS = {
  info: "text-sky-300",
  warning: "text-amber-300",
  critical: "text-red-300",
} as const;

export default function ReviewPanel({
  resultId,
  diffPaths,
  aiReview,
  setAiReview,
  reviewStatus,
  setReviewStatus,
  initialSummary,
  initialComments,
}: {
  resultId: string;
  diffPaths: string[];
  aiReview: AIReview | null;
  setAiReview: (r: AIReview) => void;
  reviewStatus: ReviewStatus;
  setReviewStatus: (s: ReviewStatus) => void;
  initialSummary: string;
  initialComments: ReviewComment[];
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [stream, setStream] = useState("");
  const [summary, setSummary] = useState(initialSummary);
  const [comments, setComments] = useState<ReviewComment[]>(initialComments);
  const [draft, setDraft] = useState<ReviewComment>({ path: diffPaths[0] ?? "", body: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runAiReview() {
    setError(null);
    setStream("");
    setRunning(true);
    await readSSE(`/api/results/${resultId}/ai-review`, {}, (e) => {
      if (e.type === "token") setStream((s) => s + e.text);
      else if (e.type === "status") setStream((s) => s + `\n[ ${e.message} ]\n`);
      else if (e.type === "review_done") setAiReview(e.review);
      else if (e.type === "error") setError(e.message);
    });
    setRunning(false);
    router.refresh();
  }

  function addComment() {
    if (!draft.body.trim()) return;
    setComments((c) => [...c, { ...draft, body: draft.body.trim() }]);
    setDraft({ path: diffPaths[0] ?? "", body: "" });
  }

  async function submitVerdict(decision: ReviewDecision) {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/results/${resultId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, summary, comments }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to submit review");
      setReviewStatus(decision);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* AI critique */}
      <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">AI Review</h3>
          <button
            onClick={runAiReview}
            disabled={running}
            className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs hover:bg-neutral-800 disabled:opacity-50"
          >
            {running ? "Reviewing…" : aiReview ? "Re-run" : "Run AI Review"}
          </button>
        </div>

        {running && (
          <pre className="terminal mt-3 max-h-40 overflow-y-auto rounded border border-neutral-800 bg-black p-2 text-[11px] text-neutral-300">
            {stream || "…"}
          </pre>
        )}

        {aiReview && (
          <div className="mt-3">
            <p className="text-sm text-neutral-300">{aiReview.summary || "(no summary)"}</p>
            {aiReview.findings.length > 0 ? (
              <ul className="mt-2 space-y-1.5 text-xs">
                {aiReview.findings.map((f, i) => (
                  <li key={i} className="rounded border border-neutral-800 p-2">
                    <span className={`font-semibold uppercase ${SEVERITY_CLASS[f.severity]}`}>
                      {f.severity}
                    </span>{" "}
                    <span className="font-mono text-neutral-400">
                      {f.path}
                      {f.line != null ? `:${f.line}` : ""}
                    </span>
                    <p className="mt-0.5 text-neutral-300">{f.message}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-emerald-400">No issues found.</p>
            )}
          </div>
        )}
      </section>

      {/* SE verdict */}
      <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        <h3 className="text-sm font-semibold">Senior Engineer Verdict</h3>
        <p className="mt-1 text-xs text-neutral-500">
          Current: <span className="font-medium text-neutral-300">{reviewStatus}</span>
        </p>

        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={3}
          placeholder="Overall review note…"
          className="mt-3 w-full resize-y rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-500"
        />

        {/* Comments */}
        {comments.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs">
            {comments.map((c, i) => (
              <li key={i} className="rounded border border-neutral-800 p-2">
                <span className="font-mono text-neutral-400">
                  {c.path}
                  {c.line != null ? `:${c.line}` : ""}
                </span>
                <p className="text-neutral-300">{c.body}</p>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 grid grid-cols-[1fr_64px] gap-2">
          <select
            value={draft.path}
            onChange={(e) => setDraft((d) => ({ ...d, path: e.target.value }))}
            className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs"
          >
            {diffPaths.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <input
            type="number"
            placeholder="line"
            value={draft.line ?? ""}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                line: e.target.value ? Number(e.target.value) : undefined,
              }))
            }
            className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs"
          />
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={draft.body}
            onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
            placeholder="Comment…"
            className="flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs"
          />
          <button
            onClick={addComment}
            className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs hover:bg-neutral-800"
          >
            Add
          </button>
        </div>

        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => submitVerdict("approved")}
            disabled={submitting}
            className="flex-1 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            onClick={() => submitVerdict("changes_requested")}
            disabled={submitting}
            className="flex-1 rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50"
          >
            Request Changes
          </button>
        </div>
      </section>
    </div>
  );
}
