"use client";

import { useState } from "react";
import type { ActivityKind, Mode } from "@/types";
import { ACTIVITY_LABEL, MODE_SHORT } from "@/lib/labels";

export interface ActivityEventClient {
  id: string;
  kind: string;
  actorMode: string;
  actorLogin?: string | null;
  detail: string;
  createdAt: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function ActivityTrail({
  taskId,
  events: initial,
}: {
  taskId: string;
  events: ActivityEventClient[];
}) {
  const [events, setEvents] = useState(initial);

  async function refresh() {
    const res = await fetch(`/api/tasks/${taskId}/activity`);
    if (res.ok) {
      const data = await res.json();
      setEvents(
        (data.events ?? []).map((e: { createdAt: string } & ActivityEventClient) => ({
          ...e,
          createdAt: e.createdAt,
        })),
      );
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-300">Activity</h3>
        <button onClick={refresh} className="text-xs text-neutral-500 hover:text-neutral-200">
          Refresh
        </button>
      </div>
      {events.length === 0 ? (
        <p className="text-sm text-neutral-500">No activity yet.</p>
      ) : (
        <ol className="space-y-2">
          {events.map((e) => (
            <li key={e.id} className="flex items-start gap-2 text-sm">
              <span
                className={
                  "mt-0.5 inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[10px] font-semibold " +
                  (e.actorMode === "se"
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-indigo-500/20 text-indigo-300")
                }
              >
                {MODE_SHORT[(e.actorMode as Mode) ?? "pm"] ?? "PM"}
              </span>
              <span className="flex-1 text-neutral-300">
                {ACTIVITY_LABEL[e.kind as ActivityKind] ?? e.kind}
                {e.actorLogin && (
                  <span className="text-neutral-500"> by @{e.actorLogin}</span>
                )}
                {e.detail && <span className="text-neutral-500"> — {e.detail}</span>}
              </span>
              <span className="shrink-0 text-xs text-neutral-600">{timeAgo(e.createdAt)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
