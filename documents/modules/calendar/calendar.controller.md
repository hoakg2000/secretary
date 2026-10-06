# Calendar Proxy Controller

- **Base Endpoint**: `/api/v1/calendar`
- **General Description**: Controller handling local proxy calendar event management and manual synchronization triggers between local calendar records and external Google Calendar API.

---

## List of Endpoints

### 1. Get Calendar Events List

- **Endpoint**: `GET /api/v1/calendar/events`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Retrieves local calendar events stored in the database within optional date range filters.

#### Data Transfer Objects (DTO)

- **Request DTO**: `GetCalendarEventsQueryDto`
  - `startDate` (`string`, optional): ISO 8601 start date filter.
  - `endDate` (`string`, optional): ISO 8601 end date filter.

- **Response DTO**: `CalendarEventResponseDto[]`
  - `id` (`string`): Local event UUID.
  - `title` (`string`): Title of the event.
  - `description` (`string`): Detailed description.
  - `location` (`string`): Event location.
  - `startTime` (`string`): ISO 8601 start timestamp.
  - `endTime` (`string`): ISO 8601 end timestamp.
  - `attendees` (`string[]`): Array of attendee email addresses.
  - `intent` (`string`): Event intent classification.
  - `priorityStatus` (`string`): Event priority level.
  - `syncState` (`CalendarSyncStateResponseDto`): Associated Google Calendar sync state details.
    - `googleEventId` (`string`): Google Calendar Event ID.
    - `syncStatus` (`string`, enum: `['SYNCED', 'DIRTY', 'CONFLICT']`): Sync status.
    - `lastSyncedAt` (`string`): ISO 8601 timestamp of last sync.
    - `etag` (`string`): ETag token from Google Calendar API for concurrency conflict detection.

---

### 2. Create Calendar Event

- **Endpoint**: `POST /api/v1/calendar/events`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Creates a new event in the local calendar database and automatically triggers synchronization to Google Calendar API.

#### Data Transfer Objects (DTO)

- **Request DTO**: `CreateCalendarEventDto`
  - `title` (`string`, required): Title of the calendar event.
  - `description` (`string`, optional): Description or notes for the event.
  - `location` (`string`, optional): Event location.
  - `startTime` (`string`, required): ISO 8601 start timestamp.
  - `endTime` (`string`, required): ISO 8601 end timestamp.
  - `attendees` (`string[]`, optional): Array of attendee emails.
  - `intent` (`string`, optional): Intent tag or context.
  - `priorityStatus` (`string`, optional): Priority level.

- **Response DTO**: `CalendarEventResponseDto`
  - `id` (`string`): Local event UUID.
  - `title` (`string`): Event title.
  - `description` (`string`): Event description.
  - `location` (`string`): Event location.
  - `startTime` (`string`): Event start time.
  - `endTime` (`string`): Event end time.
  - `attendees` (`string[]`): List of attendees.
  - `intent` (`string`): Event intent.
  - `priorityStatus` (`string`): Priority status.
  - `syncState` (`CalendarSyncStateResponseDto`): Google Calendar sync metadata.

---

### 3. Update Calendar Event

- **Endpoint**: `PUT /api/v1/calendar/events/:id`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Edits an existing local calendar event and updates the dirty sync state for reconciliation with Google Calendar API.

#### Data Transfer Objects (DTO)

- **Request DTO**: `UpdateCalendarEventDto`
  - `id` (`string`, path param): Local event UUID.
  - `title` (`string`, optional): Updated event title.
  - `description` (`string`, optional): Updated description.
  - `location` (`string`, optional): Updated location.
  - `startTime` (`string`, optional): Updated ISO 8601 start timestamp.
  - `endTime` (`string`, optional): Updated ISO 8601 end timestamp.
  - `attendees` (`string[]`, optional): Updated attendees list.
  - `intent` (`string`, optional): Updated intent.
  - `priorityStatus` (`string`, optional): Updated priority status.

- **Response DTO**: `CalendarEventResponseDto`
  - `id` (`string`): Event UUID.
  - `title` (`string`): Updated title.
  - `description` (`string`): Updated description.
  - `location` (`string`): Updated location.
  - `startTime` (`string`): Updated start time.
  - `endTime` (`string`): Updated end time.
  - `attendees` (`string[]`): Updated attendees.
  - `intent` (`string`): Updated intent.
  - `priorityStatus` (`string`): Updated priority.
  - `syncState` (`CalendarSyncStateResponseDto`): Updated sync state.

---

### 4. Delete Calendar Event

- **Endpoint**: `DELETE /api/v1/calendar/events/:id`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Deletes a local calendar event and removes or cancels the synced event from Google Calendar API.

#### Data Transfer Objects (DTO)

- **Request DTO**: `DeleteCalendarEventParamsDto`
  - `id` (`string`, path param): Local event UUID to delete.

- **Response DTO**: `DeleteCalendarEventResponseDto`
  - `success` (`boolean`): Operation success status.
  - `message` (`string`): Status description message.

---

### 5. Trigger Manual Calendar Sync

- **Endpoint**: `POST /api/v1/calendar/sync`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Triggers a manual bi-directional synchronization between the local database proxy (`local_calendars`) and the Google Calendar API, reconciling records in `calendar_sync_states` based on `SYNCED`, `DIRTY`, and `CONFLICT` status markers and ETag comparison.

#### Data Transfer Objects (DTO)

- **Request DTO**: None

- **Response DTO**: `CalendarSyncResponseDto`
  - `success` (`boolean`): Sync process status.
  - `syncedCount` (`number`): Number of events synchronized to Google Calendar.
  - `conflictCount` (`number`): Number of sync conflicts detected and flagged.
  - `lastSyncedAt` (`string`): ISO 8601 timestamp of sync completion.
