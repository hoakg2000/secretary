import { CALENDAR_TZ } from "@/lib/calendar/helpers";

/** Date and time in the user's locale, always in Vietnam time (the server's APP_TIMEZONE). */
export const formatDateTime = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short", timeZone: CALENDAR_TZ }).format(
    new Date(iso),
  );
