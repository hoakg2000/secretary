import { dayStart, todayKey } from "@/lib/calendar/helpers";

/** Decimal string (or number) -> money in the user's locale. Falls back to "1234 XYZ" for a bad currency code. */
export function formatMoney(value: string | number, currency: string, locale: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return `${value} ${currency}`;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(n);
  } catch {
    return `${n} ${currency}`;
  }
}

/**
 * User input -> number, or null when it is not a plain amount.
 * With both "," and "." the last one is the decimal mark. A single separator followed by 1-2 digits is a decimal mark,
 * otherwise ("1,500", "1.500.000") it groups thousands. Limit: "12.345" reads as 12345.
 */
export function parseAmount(input: string): number | null {
  const s = input.trim().replace(/[\s']/g, "");
  if (!/^\d+([.,]\d+)*$/.test(s)) return null;
  const seps = s.match(/[.,]/g) ?? [];
  if (seps.length === 0) return Number(s);
  const lastSep = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  const mark = s[lastSep];
  const mixed = seps.some((c) => c !== mark);
  if (mixed && seps.filter((c) => c === mark).length !== 1) return null;
  const decimal = mixed || (seps.length === 1 && s.length - lastSep - 1 <= 2);
  if (!decimal) return Number(s.replace(/[.,]/g, ""));
  return Number(`${s.slice(0, lastSep).replace(/[.,]/g, "")}.${s.slice(lastSep + 1)}`);
}

/** True when `n` has at most two decimals (the server rejects more). */
export const hasMaxTwoDecimals = (n: number) => Math.abs(Math.round(n * 100) / 100 - n) < 1e-9;

/** Number -> text for an input field (no grouping, no exponent). */
export const amountToInput = (value: string | number) => String(Number(value));

const DAY_MS = 86_400_000;

/** First and last instant of the Vietnam calendar month (month 1-12) as ISO strings. */
export function monthRange(year: number, month: number) {
  const first = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}-01`;
  const next = month === 12 ? first(year + 1, 1) : first(year, month + 1);
  return {
    startDate: dayStart(first(year, month)).toISOString(),
    endDate: new Date(dayStart(next).getTime() - 1).toISOString(),
  };
}

/** Last instant of the Vietnam day `key` (yyyy-MM-dd). */
export const endOfDay = (key: string) => new Date(dayStart(key).getTime() + DAY_MS - 1).toISOString();

/** Current (year, month) in Vietnam time. */
export function currentMonth() {
  const today = todayKey();
  return { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
}
