import { describe, expect, it } from "vitest";
import { applyFrame, newTurn } from "./live";

describe("applyFrame", () => {
  it("appends text, pairs tool results, keeps reply ids and marks errors", () => {
    let t = newTurn("k", "hi");
    t = applyFrame(t, { type: "text", content: "He" });
    t = applyFrame(t, { type: "text", content: "llo" });
    t = applyFrame(t, { type: "tool_call", tool: "a", args: { x: 1 } });
    t = applyFrame(t, { type: "tool_call", tool: "a", args: { x: 2 } });
    t = applyFrame(t, { type: "tool_result", tool: "a", result: "r1" });
    expect(t.text).toBe("Hello");
    expect(t.steps.map((s) => s.hasResult)).toEqual([true, false]);
    t = applyFrame(t, { type: "reply", messageId: "m1", contentJp: null });
    expect(t.messageId).toBe("m1");
    t = applyFrame(t, { type: "error", message: "boom" });
    expect(t).toMatchObject({ status: "error", error: "boom" });
  });
});
