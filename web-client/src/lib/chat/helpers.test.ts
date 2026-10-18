import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/api/types";
import { formatCountdown, lastPageNumber, mergeMessagePages, parseToolCalls, remainingMs } from "./helpers";

const msg = (id: string) => ({ id }) as ChatMessage;

describe("chat helpers", () => {
  it("counts down and clamps at zero", () => {
    expect(remainingMs(1000, 1000)).toBe(300_000);
    expect(remainingMs(0, 400_000)).toBe(0);
    expect(formatCountdown(245_000)).toBe("4:05");
    expect(formatCountdown(0)).toBe("0:00");
  });

  it("computes the last page", () => {
    expect(lastPageNumber(0, 30)).toBe(1);
    expect(lastPageNumber(61, 30)).toBe(3);
  });

  it("merges newest-first pages into oldest-first without duplicates", () => {
    const merged = mergeMessagePages([
      { items: [msg("c"), msg("d")] },
      { items: [msg("b"), msg("c")] },
      { items: [msg("a")] },
    ]);
    expect(merged.map((m) => m.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("ignores malformed toolCalls", () => {
    expect(parseToolCalls(null)).toEqual([]);
    expect(parseToolCalls([{ tool: "x" }, 1, { foo: 1 }])).toEqual([{ tool: "x" }]);
  });
});
