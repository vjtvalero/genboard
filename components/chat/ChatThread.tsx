"use client";

import Link from "next/link";
import type { ChatMessageView } from "@/types";

function Bubble({
  role,
  children,
}: {
  role: "user" | "assistant";
  children: React.ReactNode;
}) {
  const isUser = role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm " +
          (isUser
            ? "bg-neutral-700 text-neutral-100"
            : "border border-neutral-800 bg-neutral-900/60 text-neutral-200")
        }
      >
        {children}
      </div>
    </div>
  );
}

export default function ChatThread({
  messages,
  streamingText,
}: {
  messages: ChatMessageView[];
  streamingText: string | null;
}) {
  if (messages.length === 0 && streamingText == null) {
    return (
      <div className="p-6 text-center text-sm text-neutral-500">
        Start a conversation about this task. The engineer can discuss it and make code
        changes — any diff it produces lands in the review queue.
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3">
      {messages.map((m) => (
        <div key={m.id} className="space-y-1.5">
          <Bubble role={m.role}>{m.content || "…"}</Bubble>
          {m.role === "assistant" && m.resultId && (
            <div className="flex justify-start">
              <Link
                href={`/results/${m.resultId}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-teal-700/50 bg-teal-500/10 px-2.5 py-1 text-xs text-teal-300 hover:bg-teal-500/20"
              >
                ◆ Diff produced — review →
              </Link>
            </div>
          )}
        </div>
      ))}
      {streamingText != null && (
        <Bubble role="assistant">{streamingText || "…"}</Bubble>
      )}
    </div>
  );
}
