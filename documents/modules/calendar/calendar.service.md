# Calendar Services

- **Module**: `CalendarModule` — `server/src/calendar/calendar.module.ts`
- **Description**: local calendar CRUD, four AI tools, and a one-way push of changes to Google Calendar.

| Class | File (under `server/src/calendar/`) | Role |
|-------|-------------------------------------|------|
| `CalendarService` | `calendar.service.ts` | CRUD on `local_calendars`, marks sync state `DIRTY`. |
| `CalendarTools` | `calendar.tools.ts` | The four calendar AI tools. |
| `CalendarSyncService` | `calendar-sync.service.ts` | Cron and manual push to Google. |

**Tables**: `local_calendars`, `calendar_sync_states`, `users` (Google tokens, through `GoogleClientFactory`).

---

## CalendarService

Not an AI tool in any method (the tools call it).

### 1. createEvent(dto)

- Requires `endTime > startTime` (`BadRequestException`). Creates the event and its `calendar_sync_states` row with
  `sync_status = DIRTY` in one write. Also called by `EmailProcessor` for emails the model classifies as `EVENT`.

### 2. getEvents(query)

- `month` (1–12) and `year`; a missing one is the current month or year in `APP_TIMEZONE`. Returns events with
  `deleted_at` null that overlap that month (`start_time` < start of the next month and `end_time` > start of the
  month, month boundaries in `APP_TIMEZONE`), ordered by `start_time`, with `syncState`.

### 3. getEventById(id)

- `findFirst` with `deleted_at` null, with `syncState`. `NotFoundException` otherwise.

### 4. updateEvent(id, dto)

- Re-checks the range using stored values for fields not sent. Updates the row, upserts the sync state to `DIRTY`, and sets
  `reminded_at = null` when `startTime` changes.

### 5. deleteEvent(id)

- Has a `google_event_id` → soft delete (`deleted_at = now`) and sync state `DIRTY`. Otherwise delete the row. Returns
  `{ success: true }`.

---

## CalendarTools (AI tools)

| Tool | Confirmation | DTO | Does |
|------|--------------|-----|------|
| `get_calendar_events` | no | `QueryCalendarDto` | `CalendarService.getEvents` |
| `create_calendar_event` | no | `CreateEventDto` | `CalendarService.createEvent` |
| `update_calendar_event` | **yes** | `AiUpdateEventDto` (`id` + `UpdateEventDto`) | `CalendarService.updateEvent` |
| `delete_calendar_event` | **yes** | `AiDeleteEventDto` (`id`) | `CalendarService.deleteEvent` |

Tools with confirmation are parked in `PendingActionStore` until `POST /ai-agent/actions/:actionId/confirm`.

---

## CalendarSyncService

One-way push, local to Google (`calendarId: primary`). Local is the source of truth.

### 6. Schedule

- On bootstrap a cron job named `calendar-sync` is registered from `CALENDAR_SYNC_CRON` (default every 5 minutes).
  `handleCalendarCronSync` calls `syncLocalToGoogle` and logs, never throws.

### 7. syncLocalToGoogle()

- Returns `null` when a run is in progress or no user has Google tokens. Otherwise processes every `DIRTY` sync state
  and returns `{ pushed, deleted, removedRemotely, failed }`. One failing event increments `failed` and does not stop the rest.
- Soft-deleted event: delete on Google (404 / 410 ignored), then delete the local row → `deleted`.
- No `google_event_id`: `events.insert` with a client-generated ID (the local UUID without dashes), so a retry does not
  create a second event; a 409 is treated as "already created" and continues as an update → `pushed`.
- Has a `google_event_id`: `events.patch` with only the fields local owns (`summary`, `description`, `location`, `start`,
  `end`) → `pushed`. A 404 / 410 means the event was deleted on Google: the Google ID is cleared, the state becomes
  `SYNCED`, and the event is not pushed again → `removedRemotely`.
- `markSynced` sets `SYNCED`, `etag`, `last_synced_at` only when the sync state's `updated_at` is unchanged since it was read. If
  the event was edited meanwhile it stays `DIRTY` for the next run, and the Google ID is still saved.
- **Tables**: `calendar_sync_states` (read, update), `local_calendars` (delete).

### 8. Reminders

- Not here: the reminder cron is `ProactiveService.handleFallbackCron` (every 10 minutes, events starting within 15
  minutes, once per start time through `reminded_at`).
