import { ApiError, apiFetchRaw } from "./client";
import type { ChatFrame, ChatStreamInput } from "./types";

function parseEvent(block: string): ChatFrame | null {
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (!line.startsWith("data:")) continue; // comments, id:, event:, retry: are not used by the server
    data.push(line.slice(5).replace(/^ /, ""));
  }
  if (!data.length) return null;
  try {
    return JSON.parse(data.join("\n")) as ChatFrame;
  } catch {
    return null; // a malformed frame must not kill the stream
  }
}

/**
 * Yields one ChatFrame per SSE event. Handles events split across chunks, CRLF / CR line ends
 * and a last event without the closing blank line.
 */
export async function* parseSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<ChatFrame> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let raw = ""; // decoded, line ends not normalized yet
  let buffer = ""; // normalized, may hold a partial event

  try {
    for (;;) {
      const { value, done } = await reader.read();
      raw += done ? decoder.decode() : decoder.decode(value, { stream: true });
      // keep a trailing "\r": its "\n" may arrive in the next chunk
      const end = !done && raw.endsWith("\r") ? raw.length - 1 : raw.length;
      buffer += raw.slice(0, end).replace(/\r\n?/g, "\n");
      raw = raw.slice(end);

      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const block of events) {
        const frame = parseEvent(block);
        if (frame) yield frame;
      }
      if (done) break;
    }
    const last = parseEvent(buffer);
    if (last) yield last;
  } finally {
    reader.cancel().catch(() => {});
  }
}

/** POST /ai-agent/chat/stream. Errors before the stream opens (400/404) throw ApiError. */
export async function streamChat(body: ChatStreamInput, signal?: AbortSignal): Promise<AsyncGenerator<ChatFrame>> {
  const res = await apiFetchRaw("/ai-agent/chat/stream", {
    method: "POST",
    json: body,
    signal,
    headers: { Accept: "text/event-stream" },
  });
  if (!res.body) throw new ApiError(0, "Empty stream");
  return parseSse(res.body);
}
