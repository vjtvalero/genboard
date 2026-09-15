"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChatMessageView } from "@/types";
import { readSSE } from "@/lib/stream-client";
import ChatThread from "./ChatThread";
import ChatInput from "./ChatInput";

export default function ChatTab({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadHistory = useCallback(async (): Promise<string | null> => {
    const res = await fetch(`/api/tasks/${taskId}/chat`);
    if (!res.ok) return null;
    const data = await res.json();
    setMessages(data.messages ?? []);
    return data.activeRunId ?? null;
  }, [taskId]);

  // Consume an SSE stream of one chat turn into the streaming bubble.
  const consume = useCallback(
    async (url: string, body: unknown, method: "GET" | "POST") => {
      setSending(true);
      setError(null);
      setStreamingText("");
      await readSSE(
        url,
        body,
        (e) => {
          if (e.type === "token") setStreamingText((s) => (s ?? "") + e.text);
          else if (e.type === "error") setError(e.message);
        },
        { method },
      );
      setStreamingText(null);
      setSending(false);
      await loadHistory();
      router.refresh(); // refresh the review queue / sidebar
    },
    [loadHistory, router],
  );

  // Initial load; reconnect to an in-progress turn if one exists.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const activeRunId = await loadHistory();
      if (!cancelled && activeRunId) {
        await consume(`/api/tasks/${taskId}/chat?stream=1`, null, "GET");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streamingText]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    // Optimistic user bubble; loadHistory() after the turn replaces it with the
    // persisted message (and the assistant reply + diff card).
    setMessages((m) => [
      ...m,
      {
        id: `local-${Date.now()}`,
        role: "user",
        content: text,
        resultId: null,
        createdAt: new Date().toISOString(),
      },
    ]);
    await consume(`/api/tasks/${taskId}/chat`, { text }, "POST");
  }

  return (
    <div className="flex h-[32rem] flex-col rounded-lg border border-neutral-800 bg-neutral-950/40">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <ChatThread messages={messages} streamingText={streamingText} />
      </div>
      {error && <p className="px-3 py-1 text-sm text-red-400">{error}</p>}
      <ChatInput value={input} onChange={setInput} onSend={send} disabled={sending} />
    </div>
  );
}
