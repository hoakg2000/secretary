import type { ChatMessage } from "@/lib/api/types";

/** The server keeps a pending action for 5 minutes. */
export const ACTION_TTL_MS = 5 * 60_000;

export const remainingMs = (receivedAt: number, now: number, ttl = ACTION_TTL_MS) =>
  Math.max(0, receivedAt + ttl - now);

/** 4:05 */
export function formatCountdown(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const lastPageNumber = (total: number, pageSize: number) => Math.max(1, Math.ceil(total / pageSize));

/**
 * Message pages are loaded newest page first (pages[0] is the newest), each page oldest first.
 * Returns one oldest-first list; the same id twice (page boundary shifted by a new message) is kept once.
 */
export function mergeMessagePages(pages: { items: ChatMessage[] }[]): ChatMessage[] {
  const seen = new Set<string>();
  const out: ChatMessage[] = [];
  for (const page of [...pages].reverse()) {
    for (const m of page.items) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
  }
  return out;
}

export interface StoredToolCall {
  tool: string;
  args?: unknown;
  result?: unknown;
  error?: string;
}

export function parseToolCalls(value: unknown): StoredToolCall[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (c): c is StoredToolCall => !!c && typeof c === "object" && typeof (c as StoredToolCall).tool === "string",
  );
}
