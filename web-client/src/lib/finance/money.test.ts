import { describe, expect, it } from "vitest";
import { formatMoney, hasMaxTwoDecimals, monthRange, parseAmount } from "./money";

describe("parseAmount", () => {
  it.each([
    ["50000", 50000],
    ["1,234.56", 1234.56],
    ["1.234,56", 1234.56],
    ["12.5", 12.5],
    ["12,5", 12.5],
    ["1,500", 1500],
    ["1.500.000", 1500000],
    ["1 500 000", 1500000],
  ])("%s -> %s", (input, expected) => expect(parseAmount(input)).toBe(expected));
  it.each(["", "abc", "1..2", "12a", "-5", "1.5.0", "10.00.0"])("rejects %j", (input) => expect(parseAmount(input)).toBeNull());
});

describe("hasMaxTwoDecimals", () => {
  it("accepts 2 decimals and rejects 3", () => {
    expect(hasMaxTwoDecimals(10.25)).toBe(true);
    expect(hasMaxTwoDecimals(10.255)).toBe(false);
  });
});

describe("monthRange", () => {
  it("covers the Vietnam month (UTC+7)", () => {
    expect(monthRange(2026, 10)).toEqual({
      startDate: "2026-09-30T17:00:00.000Z",
      endDate: "2026-10-31T16:59:59.999Z",
    });
  });
  it("rolls over the year", () => {
    expect(monthRange(2026, 12).endDate).toBe("2026-12-31T16:59:59.999Z");
  });
});

describe("formatMoney", () => {
  it("formats a currency and survives a bad code", () => {
    expect(formatMoney("50000", "VND", "en")).toContain("50,000");
    expect(formatMoney("5", "??", "en")).toBe("5 ??");
  });
});
