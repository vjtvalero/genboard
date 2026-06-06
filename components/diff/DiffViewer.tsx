"use client";

import "react-diff-view/style/index.css";
import { useState } from "react";
import { parseDiff, Diff, Hunk } from "react-diff-view";
import type { DiffFile, AIReviewFinding } from "@/types";

const SEVERITY_DOT: Record<AIReviewFinding["severity"], string> = {
  info: "bg-sky-400",
  warning: "bg-amber-400",
  critical: "bg-red-500",
};

export default function DiffViewer({
  diff,
  findings = [],
}: {
  diff: DiffFile[];
  findings?: AIReviewFinding[];
}) {
  const [active, setActive] = useState(0);

  if (diff.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-800 p-8 text-center text-neutral-500">
        No file changes in this result.
      </div>
    );
  }

  const file = diff[active];
  const parsed = parseDiff(file.hunks);
  const fileFindings = findings.filter((f) => f.path === file.path);

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40">
      {/* File tabs */}
      <div className="flex flex-wrap gap-1 border-b border-neutral-800 p-2">
        {diff.map((d, i) => {
          const count = findings.filter((f) => f.path === d.path).length;
          return (
            <button
              key={d.path}
              onClick={() => setActive(i)}
              className={
                "flex items-center gap-2 rounded-md px-2.5 py-1 text-xs font-mono transition " +
                (i === active
                  ? "bg-neutral-800 text-neutral-100"
                  : "text-neutral-400 hover:bg-neutral-800/60")
              }
            >
              <span className="truncate max-w-[220px]">{d.path}</span>
              <span className="text-emerald-400">+{d.additions}</span>
              <span className="text-rose-400">-{d.deletions}</span>
              {count > 0 && (
                <span className="rounded-full bg-amber-500/30 px-1.5 text-[10px] text-amber-200">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* AI finding anchors for the active file */}
      {fileFindings.length > 0 && (
        <ul className="space-y-1 border-b border-neutral-800 bg-amber-500/5 p-2 text-xs">
          {fileFindings.map((f, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[f.severity]}`} />
              <span className="text-neutral-300">
                {f.line != null && <span className="text-neutral-500">L{f.line}: </span>}
                {f.message}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto p-1">
        {parsed.map((f) => (
          <Diff
            key={f.oldRevision + f.newRevision}
            viewType="unified"
            diffType={f.type}
            hunks={f.hunks}
          >
            {(hunks) => hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)}
          </Diff>
        ))}
      </div>
    </div>
  );
}
