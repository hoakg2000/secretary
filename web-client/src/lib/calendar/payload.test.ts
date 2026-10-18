import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@/lib/api/types";
import { eventFormValues, toCreateInput, toPatch } from "./payload";

const event = {
  id: "1",
  title: "Review",
  description: "old",
  location: null,
  startTime: "2026-10-15T02:00:00.000Z",
  endTime: "2026-10-15T03:00:00.000Z",
  intent: null,
  priorityStatus: null,
} as CalendarEvent;

describe("calendar payloads", () => {
  it("prefills a new event with 09:00-10:00 on the clicked day", () => {
    const v = eventFormValues(undefined, "2026-10-20");
    expect(toCreateInput({ ...v, title: "x" })).toEqual({
      title: "x",
      startTime: "2026-10-20T02:00:00.000Z",
      endTime: "2026-10-20T03:00:00.000Z",
    });
  });
  it("patch nulls only emptied fields that had a value", () => {
    expect(toPatch({ ...eventFormValues(event), description: "" }, event)).toEqual({
      title: "Review",
      startTime: event.startTime,
      endTime: event.endTime,
      description: null,
    });
  });
});
