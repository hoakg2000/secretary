import { describe, expect, it } from "vitest";
import { parseSse } from "./sse";
import type { ChatFrame } from "./types";

const encoder = new TextEncoder();

function streamOf(...chunks: (string | Uint8Array)[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(typeof c === "string" ? encoder.encode(c) : c);
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const frames: ChatFrame[] = [];
  for await (const f of parseSse(stream)) frames.push(f);
  return frames;
}

describe("parseSse", () => {
  it("parses frames from one chunk", async () => {
    const frames = await collect(
      streamOf('data: {"type":"session","sessionId":"s1"}\n\ndata: {"type":"text","content":"hi"}\n\ndata: {"type":"done"}\n\n'),
    );
    expect(frames).toEqual([
      { type: "session", sessionId: "s1" },
      { type: "text", content: "hi" },
      { type: "done" },
    ]);
  });

  it("joins a frame split across chunks, including mid-JSON and mid-delimiter", async () => {
    const frames = await collect(
      streamOf('data: {"type":"te', 'xt","content":"a"}\n', '\ndata: {"type":"done"}\n', "\n"),
    );
    expect(frames).toEqual([{ type: "text", content: "a" }, { type: "done" }]);
  });

  it("handles CRLF, including a CR and LF in separate chunks", async () => {
    const frames = await collect(
      streamOf('data: {"type":"text","content":"a"}\r\n\r', '\ndata: {"type":"done"}\r\n\r\n'),
    );
    expect(frames).toEqual([{ type: "text", content: "a" }, { type: "done" }]);
  });

  it("emits a last frame without the trailing blank line", async () => {
    const frames = await collect(streamOf('data: {"type":"text","content":"a"}\n\ndata: {"type":"done"}'));
    expect(frames).toEqual([{ type: "text", content: "a" }, { type: "done" }]);
  });

  it("keeps multibyte characters split across chunks", async () => {
    const bytes = encoder.encode('data: {"type":"text","content":"Xin chào ạ"}\n\n');
    const cut = bytes.indexOf(0xc3) + 1; // inside "à"
    const frames = await collect(streamOf(bytes.slice(0, cut), bytes.slice(cut)));
    expect(frames).toEqual([{ type: "text", content: "Xin chào ạ" }]);
  });

  it("ignores comments and malformed frames", async () => {
    const frames = await collect(streamOf(': ping\n\ndata: not json\n\ndata: {"type":"done"}\n\n'));
    expect(frames).toEqual([{ type: "done" }]);
  });

  it("delivers an error frame that arrives before done", async () => {
    const frames = await collect(
      streamOf('data: {"type":"text","content":"a"}\n\ndata: {"type":"error","message":"boom"}\n\ndata: {"type":"done"}\n\n'),
    );
    expect(frames.map((f) => f.type)).toEqual(["text", "error", "done"]);
    expect(frames[1]).toEqual({ type: "error", message: "boom" });
  });
});
