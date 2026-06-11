import type { StreamEvent } from "@/types";

/**
 * POST to an SSE endpoint and invoke `onEvent` for each parsed StreamEvent.
 * Client-side only (uses fetch streaming + TextDecoder).
 */
export async function readSSE(
  url: string,
  body: unknown,
  onEvent: (event: StreamEvent) => void,
  options: { method?: "GET" | "POST" } = {},
): Promise<void> {
  const method = options.method ?? "POST";
  const res = await fetch(url, {
    method,
    headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });

  if (!res.ok || !res.body) {
    let message = `Request failed (${res.status})`;
    try {
      message = (await res.json()).error ?? message;
    } catch {
      /* ignore */
    }
    onEvent({ type: "error", message });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      try {
        onEvent(JSON.parse(dataLine.slice(5).trim()) as StreamEvent);
      } catch {
        /* ignore malformed frame */
      }
    }
  }
}
