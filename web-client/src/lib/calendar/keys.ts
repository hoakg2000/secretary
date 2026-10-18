export const CALENDAR_KEY = ["calendar"] as const;
export const calendarMonthKey = (year: number, month: number) => [...CALENDAR_KEY, year, month] as const;
