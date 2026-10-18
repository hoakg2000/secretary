import type { CalendarEventPatch } from "@/lib/api/endpoints/calendar";
import type { CalendarEvent, CalendarEventInput } from "@/lib/api/types";
import { fromLocalInput, toLocalInput } from "./helpers";

export interface EventFormValues {
  title: string;
  description: string;
  location: string;
  /** datetime-local value, Vietnam time */
  startTime: string;
  endTime: string;
  intent: string;
  priorityStatus: string;
}

const OPTIONAL = ["description", "location", "intent", "priorityStatus"] as const;

export function eventFormValues(event?: CalendarEvent, day?: string): EventFormValues {
  return {
    title: event?.title ?? "",
    description: event?.description ?? "",
    location: event?.location ?? "",
    startTime: event ? toLocalInput(event.startTime) : `${day}T09:00`,
    endTime: event ? toLocalInput(event.endTime) : `${day}T10:00`,
    intent: event?.intent ?? "",
    priorityStatus: event?.priorityStatus ?? "",
  };
}

export function toCreateInput(v: EventFormValues): CalendarEventInput {
  const input: CalendarEventInput = {
    title: v.title.trim(),
    startTime: fromLocalInput(v.startTime),
    endTime: fromLocalInput(v.endTime),
  };
  for (const k of OPTIONAL) if (v[k].trim()) input[k] = v[k].trim();
  return input;
}

/** Emptied optional fields that had a value are sent as `null` so the server clears them. */
export function toPatch(v: EventFormValues, original: CalendarEvent): CalendarEventPatch {
  const patch: CalendarEventPatch = {
    title: v.title.trim(),
    startTime: fromLocalInput(v.startTime),
    endTime: fromLocalInput(v.endTime),
  };
  for (const k of OPTIONAL) {
    const next = v[k].trim();
    if (next) patch[k] = next;
    else if (original[k] !== null) patch[k] = null;
  }
  return patch;
}
