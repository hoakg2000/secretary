# Calendar Controller

- **Class**: `CalendarController` — `server/src/calendar/calendar.controller.ts`
- **Base endpoint**: `/api/v1/calendar`
- **Auth**: every route needs the application JWT (global `JwtAuthGuard`).
- **Response**: `{ statusCode, message, data }`.
- **Description**: the local calendar. Local is the source of truth; changes are pushed one way to Google Calendar by
  `POST /calendar/sync` and a cron. Pulling events from Google is not built.

Status tags: `[Implemented]` = in the code today. `[Planned]` = designed, not built.

## Change log

| Date | Change |
|------|--------|
| 2026-10-16 | Rewritten from the code. Base path is `/calendar` (was `/calendar/events`); update is `PATCH` (was `PUT`); sync is one-way push (was bi-directional). Added `POST /calendar/sync` and the soft-delete rule. Query uses `fromDate` / `toDate`. Pull sync and conflict handling are `[De-scoped]`. |
| 2026-10-16 | Review fixes: pull sync and conflict handling are `[De-scoped]` (as in `summary.md`), not `[Planned]`. |

---

## Endpoints

### 1. Push now — `POST /api/v1/calendar/sync` `[Implemented]`

- **Handler**: `syncNow()` → `CalendarSyncService.syncLocalToGoogle`. Returns 200.
- **Response `data`**: `{ pushed, deleted, removedRemotely, failed }`, or `null` when Google is not connected or another
  run is in progress.

### 2. Create — `POST /api/v1/calendar` `[Implemented]`

- **Handler**: `createEvent(dto)`. Returns 201, with `syncState` (`syncStatus: DIRTY`).
- **Request** `CreateEventDto`: `title`, `startTime`, `endTime` (dates) required; `description?`, `location?`,
  `attendees?` (array), `intent?`, `priorityStatus?`. `endTime` must be after `startTime`, else 400.

### 3. List — `GET /api/v1/calendar?fromDate=&toDate=` `[Implemented]`

- **Handler**: `getEvents(query)`. **Query** `QueryCalendarDto`: `fromDate?`, `toDate?`. Events that overlap the range
  (start at or before `toDate`, end at or after `fromDate`), ordered by start time, without soft-deleted rows.

### 4. Get one — `GET /api/v1/calendar/:id` `[Implemented]`

- **Handler**: `getEventById(id)`. With `syncState`. 404 when missing or soft-deleted.

### 5. Update — `PATCH /api/v1/calendar/:id` `[Implemented]`

- **Handler**: `updateEvent(id, dto)`. **Request** `UpdateEventDto`: every field of `CreateEventDto`, optional. The range
  is checked against the stored values for a field not sent (400). Marks `syncState` `DIRTY`. A new `startTime` clears
  `reminded_at`, so the reminder fires again.

### 6. Delete — `DELETE /api/v1/calendar/:id` `[Implemented]`

- **Handler**: `deleteEvent(id)`. `data`: `{ success: true }`. An event already on Google is soft-deleted
  (`deleted_at`) and `DIRTY`; the next sync deletes it on Google and then removes the row. An event never pushed is
  deleted at once.

## Not built `[De-scoped]`

- Pull sync from Google, conflict handling (`CONFLICT` exists in `SyncStatus` but nothing sets it).
