import type { Priority, TaskStatus, Mode, ActivityKind } from "@/types";

export const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: "Backlog",
  running: "Running",
  executed: "Executed",
  in_review: "In Review",
  changes_requested: "Changes Requested",
  approved: "Approved",
  pr_opened: "PR Opened",
  pushed: "Pushed",
  failed: "Failed",
};

// Tailwind classes for status chips (safe-listed via literal strings).
export const STATUS_CLASS: Record<TaskStatus, string> = {
  backlog: "bg-neutral-800 text-neutral-300",
  running: "bg-amber-500/20 text-amber-300",
  executed: "bg-sky-500/20 text-sky-300",
  in_review: "bg-violet-500/20 text-violet-300",
  changes_requested: "bg-rose-500/20 text-rose-300",
  approved: "bg-emerald-500/20 text-emerald-300",
  pr_opened: "bg-emerald-600/30 text-emerald-200",
  pushed: "bg-emerald-600/30 text-emerald-200",
  failed: "bg-red-600/30 text-red-300",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const PRIORITY_CLASS: Record<Priority, string> = {
  low: "bg-neutral-800 text-neutral-400",
  medium: "bg-sky-500/15 text-sky-300",
  high: "bg-orange-500/20 text-orange-300",
  urgent: "bg-red-500/25 text-red-300",
};

export const PRIORITY_ORDER: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export const MODE_LABEL: Record<Mode, string> = {
  pm: "Project Manager",
  se: "Senior Engineer",
};

export const MODE_SHORT: Record<Mode, string> = { pm: "PM", se: "SE" };

export const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  created: "created the task",
  executed: "executed a run",
  ai_reviewed: "ran AI review",
  approved: "approved the result",
  changes_requested: "requested changes",
  pr_opened: "opened a pull request",
  pushed: "pushed to origin",
  reordered: "reordered the backlog",
  rolled_back: "rolled back changes",
  failed: "run failed",
};

export const ALL_PRIORITIES: Priority[] = ["urgent", "high", "medium", "low"];
