import type { StreamEvent } from "@/types";

/** Serialize a StreamEvent as an SSE `data:` frame. */
export function sseFrame(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** Standard headers for an SSE response. */
export const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

/**
 * Build a streaming Response from an async generator of StreamEvents.
 * Encodes each event as an SSE frame.
 */
export function sseResponse(
  gen: AsyncGenerator<StreamEvent, void, unknown>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await gen.next();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(sseFrame(value)));
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            sseFrame({ type: "error", message: (err as Error).message }),
          ),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
