"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Priority } from "@/types";
import { ALL_PRIORITIES, PRIORITY_LABEL } from "@/lib/labels";

export default function CreateTaskModal({
  repo,
  onClose,
}: {
  repo: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!title.trim() || !prompt.trim()) {
      setError("Title and prompt are required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoFullName: repo, title, prompt, priority }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create task");
      onClose();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">New task</h2>
        <p className="mt-1 text-xs text-neutral-500">{repo}</p>

        <label className="mt-4 block text-sm font-medium text-neutral-300">Title</label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a dark-mode toggle to the header"
          className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-500"
        />

        <label className="mt-4 block text-sm font-medium text-neutral-300">
          Prompt (what should the engineer do?)
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={6}
          placeholder="Describe the change in detail…"
          className="mt-1 w-full resize-y rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-500"
        />

        <label className="mt-4 block text-sm font-medium text-neutral-300">Priority</label>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          className="mt-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-500"
        >
          {ALL_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="accent-bg rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create task"}
          </button>
        </div>
      </div>
    </div>
  );
}
