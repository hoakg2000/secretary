import { describe, expect, it } from "vitest";
import { buildMonthGrid, eventsOnDay, fromLocalInput, shiftMonth, toLocalInput } from "./helpers";

describe("buildMonthGrid", () => {
  it("starts on Monday and pads with adjacent days (Oct 2026 starts Thursday)", () => {
    const grid = buildMonthGrid(2026, 10);
    expect(grid[0][0]).toEqual({ key: "2026-09-28", inMonth: false });
    expect(grid[0][3]).toEqual({ key: "2026-10-01", inMonth: true });
    expect(grid).toHaveLength(5);
    expect(grid.every((w) => w.length === 7)).toBe(true);
  });
  it("uses 4 weeks for a Monday-start 28-day month (Feb 2027)", () => {
    expect(buildMonthGrid(2027, 2)).toHaveLength(4);
  });
  it("uses 6 weeks for a 31-day month starting Sunday (Mar 2026)", () => {
    expect(buildMonthGrid(2026, 3)).toHaveLength(6);
  });
});

describe("timezone conversion", () => {
  it("round-trips Vietnam local time as UTC", () => {
    expect(fromLocalInput("2026-10-15T09:00")).toBe("2026-10-15T02:00:00.000Z");
    expect(toLocalInput("2026-10-15T02:00:00.000Z")).toBe("2026-10-15T09:00");
  });
});

describe("eventsOnDay", () => {
  const multi = { startTime: "2026-10-14T10:00:00.000Z", endTime: "2026-10-16T10:00:00.000Z" };
  it("shows a multi-day event on each day it overlaps", () => {
    expect(eventsOnDay([multi], "2026-10-14")).toHaveLength(1);
    expect(eventsOnDay([multi], "2026-10-15")).toHaveLength(1);
    expect(eventsOnDay([multi], "2026-10-16")).toHaveLength(1);
    expect(eventsOnDay([multi], "2026-10-17")).toHaveLength(0);
  });
  it("uses Vietnam days: 20:00Z is already the next day", () => {
    const e = { startTime: "2026-10-14T20:00:00.000Z", endTime: "2026-10-14T21:00:00.000Z" };
    expect(eventsOnDay([e], "2026-10-14")).toHaveLength(0);
    expect(eventsOnDay([e], "2026-10-15")).toHaveLength(1);
  });
  it("does not spill an event ending exactly at midnight", () => {
    const e = { startTime: "2026-10-14T15:00:00.000Z", endTime: "2026-10-14T17:00:00.000Z" };
    expect(eventsOnDay([e], "2026-10-15")).toHaveLength(0);
  });
});

describe("shiftMonth", () => {
  it("wraps years", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });
});
