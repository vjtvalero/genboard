"use client";

import { useState } from "react";
import Link from "next/link";
import type { AIReview, DiffFile, ReviewComment, ReviewStatus } from "@/types";
import DiffViewer from "./DiffViewer";
import ReviewPanel from "./ReviewPanel";
import ApproveBar from "./ApproveBar";

export default function DiffWorkspace({
  resultId,
  taskId,
  taskTitle,
  repoFullName,
  diff,
  initialAiReview,
  initialReviewStatus,
  initialSummary,
  initialComments,
  initialCommitSha,
  initialPrNumber,
  initialPrUrl,
  initialPrMerged,
}: {
  resultId: string;
  taskId: string;
  taskTitle: string;
  repoFullName: string;
  diff: DiffFile[];
  initialAiReview: AIReview | null;
  initialReviewStatus: ReviewStatus;
  initialSummary: string;
  initialComments: ReviewComment[];
  initialCommitSha: string | null;
  initialPrNumber: number | null;
  initialPrUrl: string | null;
  initialPrMerged: boolean;
}) {
  const [aiReview, setAiReview] = useState<AIReview | null>(initialAiReview);
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>(initialReviewStatus);

  const diffPaths = diff.map((d) => d.path);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-2 text-xs text-neutral-500">
        <Link href={`/tasks/${taskId}`} className="hover:text-neutral-300">
          ← {taskTitle}
        </Link>
        <span>·</span>
        <span>{repoFullName}</span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          <DiffViewer diff={diff} findings={aiReview?.findings ?? []} />
        </div>

        <div className="space-y-4">
          <ReviewPanel
            resultId={resultId}
            diffPaths={diffPaths}
            aiReview={aiReview}
            setAiReview={setAiReview}
            reviewStatus={reviewStatus}
            setReviewStatus={setReviewStatus}
            initialSummary={initialSummary}
            initialComments={initialComments}
          />
          <ApproveBar
            resultId={resultId}
            taskTitle={taskTitle}
            reviewStatus={reviewStatus}
            initialCommitSha={initialCommitSha}
            initialPrNumber={initialPrNumber}
            initialPrUrl={initialPrUrl}
            prMerged={initialPrMerged}
          />
        </div>
      </div>
    </div>
  );
}
