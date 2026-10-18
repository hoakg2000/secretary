import { apiFetch } from "../client";
import type { CalendarEvent, CalendarEventInput, CalendarQuery, CalendarSyncResult, Id } from "../types";

export const listEvents = (query?: CalendarQuery) => apiFetch<CalendarEvent[]>("/calendar", { query });
export const getEvent = (id: Id) => apiFetch<CalendarEvent>(`/calendar/${id}`);
export const createEvent = (input: CalendarEventInput) =>
  apiFetch<CalendarEvent>("/calendar", { method: "POST", json: input });
export const updateEvent = (id: Id, input: Partial<CalendarEventInput>) =>
  apiFetch<CalendarEvent>(`/calendar/${id}`, { method: "PATCH", json: input });
export const deleteEvent = (id: Id) => apiFetch<unknown>(`/calendar/${id}`, { method: "DELETE" });
/** `null` when Google is not connected or a sync run is in progress. */
export const syncCalendar = () => apiFetch<CalendarSyncResult>("/calendar/sync", { method: "POST" });
