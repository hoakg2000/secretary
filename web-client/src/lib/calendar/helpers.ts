import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const CALENDAR_TZ = "Asia/Ho_Chi_Minh";

const DAY_MS = 86_400_000;

export interface GridDay {
  /** yyyy-MM-dd */
  key: string;
  inMonth: boolean;
}

/** Weeks (Monday first) covering `month` (1-12). Pure calendar math, no timezone involved. */
export function buildMonthGrid(year: number, month: number): GridDay[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const weeks = Math.ceil((offset + daysInMonth) / 7);
  const start = Date.UTC(year, month - 1, 1 - offset);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = new Date(start + (w * 7 + d) * DAY_MS);
      return { key: date.toISOString().slice(0, 10), inMonth: date.getUTCMonth() === month - 1 };
    }),
  );
}

/** Start of the Vietnam day `key` (yyyy-MM-dd) as an instant. */
export const dayStart = (key: string) => fromZonedTime(`${key}T00:00:00`, CALENDAR_TZ);

const nextKey = (key: string) => new Date(Date.parse(`${key}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

/** Events overlapping the Vietnam day `key`; an event ending exactly at 00:00 does not spill into that day. */
export function eventsOnDay<T extends { startTime: string; endTime: string }>(events: T[], key: string): T[] {
  const from = dayStart(key).getTime();
  const to = dayStart(nextKey(key)).getTime();
  return events.filter((e) => Date.parse(e.startTime) < to && Date.parse(e.endTime) > from);
}

/** ISO instant -> value for `<input type="datetime-local">` in Vietnam time. */
export const toLocalInput = (iso: string) => formatInTimeZone(iso, CALENDAR_TZ, "yyyy-MM-dd'T'HH:mm");

/** `datetime-local` value (Vietnam time) -> ISO UTC. */
export const fromLocalInput = (value: string) => fromZonedTime(value, CALENDAR_TZ).toISOString();

export const formatTime = (iso: string) => formatInTimeZone(iso, CALENDAR_TZ, "HH:mm");

/** Current yyyy-MM-dd in Vietnam time. */
export const todayKey = (now = new Date()) => formatInTimeZone(now, CALENDAR_TZ, "yyyy-MM-dd");

/** Shift a (year, month) pair by `delta` months. */
export function shiftMonth(year: number, month: number, delta: number) {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}
