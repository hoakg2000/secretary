# Calendar Proxy Service

- **General Description**: Service responsible for local calendar event CRUD operations, sync state management, bi-directional reconciliation with Google Calendar API, and exposed AI Tool functionality for calendar queries.
- **Accessed Database Tables**:
  - `local_calendars`
  - `calendar_sync_states`

---

## List of Methods

### 1. getEvents

- **Task Description**: Retrieves local calendar events from `local_calendars` along with their corresponding `calendar_sync_states` records. Exposed as an AI Tool for retrieving events.
- **Accessed Tables**: `local_calendars`, `calendar_sync_states` (Read)
- **AI Tool Integration**:
  - **Tool Name**: `get_calendar_events`
  - **Tool Description**: `Retrieves local DB calendar events within an optional time window.`
  - **Parameters Schema**:
    - `startDate` (`string`, optional): ISO 8601 start date timestamp.
    - `endDate` (`string`, optional): ISO 8601 end date timestamp.

#### Input / Output

- **Input**:
  - `query`: `GetCalendarEventsQueryDto` - Query containing optional startDate and endDate parameters.

- **Output**:
  - `Promise<CalendarEventResponseDto[]>`: Array of local calendar events with sync state details.

---

### 2. createEvent

- **Task Description**: Inserts a new calendar event into `local_calendars`, creates an initial sync state record in `calendar_sync_states`, and initiates an asynchronous or direct sync call to Google Calendar API. Exposed as an AI Tool for creating schedule events.
- **Accessed Tables**: `local_calendars` (Write), `calendar_sync_states` (Write)
- **AI Tool Integration**:
  - **Tool Name**: `create_calendar_event`
  - **Tool Description**: `Creates a new calendar event in local calendar and syncs to Google Calendar.`
  - **Parameters Schema**:
    - `title` (`string`, required): Event title.
    - `startTime` (`string`, required): Start time in ISO format.
    - `endTime` (`string`, required): End time in ISO format.
    - `description` (`string`, optional): Details or description.
    - `location` (`string`, optional): Event location.

#### Input / Output

- **Input**:
  - `dto`: `CreateCalendarEventDto` - Data required to create local event and populate sync fields.

- **Output**:
  - `Promise<CalendarEventResponseDto>`: Created local calendar event along with Google Calendar sync response.

---

### 3. updateEvent

- **Task Description**: Modifies an existing calendar event in `local_calendars` and transitions its `calendar_sync_states.sync_status` to `DIRTY`. Attempts an immediate sync with Google Calendar API using ETag condition:
  - On successful Google Calendar API update: Stores new ETag and updates `sync_status` to `SYNCED`.
  - On ETag mismatch / concurrent modification: Sets `sync_status` to `CONFLICT` for manual/orchestrated resolution.
- **Accessed Tables**: `local_calendars` (Read, Write), `calendar_sync_states` (Read, Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `id` (`string`): Local calendar event UUID.
  - `dto`: `UpdateCalendarEventDto` - Partial update properties for event.

- **Output**:
  - `Promise<CalendarEventResponseDto>`: Updated calendar event entity representation.

---

### 4. deleteEvent

- **Task Description**: Removes a calendar event from `local_calendars`, deletes or cancels the associated remote event via Google Calendar API, and removes or marks the `calendar_sync_states` record.
- **Accessed Tables**: `local_calendars` (Read, Delete), `calendar_sync_states` (Read, Delete)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `id` (`string`): Local calendar event UUID to delete.

- **Output**:
  - `Promise<DeleteCalendarEventResponseDto>`: Deletion success confirmation status.

---

### 5. syncGoogleCalendar

- **Task Description**: Executes bi-directional synchronization between `local_calendars` and Google Calendar API:
  - Identifies events with `DIRTY` status in `calendar_sync_states` and pushes updates to Google Calendar API with ETag matching (`If-Match`).
  - Identifies events updated or added on Google Calendar since `lastSyncedAt`:
    - If local record is unmodified (`SYNCED`): Pulls remote updates into `local_calendars` and updates ETag.
    - If local record has unpushed modifications (`DIRTY`): Flags `sync_status` as `CONFLICT`.
  - Updates `last_synced_at` timestamp and sync metrics.
- **Accessed Tables**: `local_calendars` (Read, Write), `calendar_sync_states` (Read, Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**: None

- **Output**:
  - `Promise<CalendarSyncResponseDto>`: Sync metrics including count of synchronized events, conflicts detected, and completion timestamp.

---

### 6. handleCalendarAutoSyncCron

- **Task Description**: Scheduled background Cron Job that runs automatically at a fixed interval to perform silent bi-directional calendar synchronization without requiring any manual trigger. Internally calls `syncGoogleCalendar()` logic to:
  1. Identify all `DIRTY` local events and push changes to Google Calendar API.
  2. Pull any remote updates from Google Calendar that occurred since `last_synced_at`.
  3. Detect and flag `CONFLICT` records where both local and remote changes exist simultaneously.
  4. Logs sync outcomes (count of synced events, conflicts, errors) to application telemetry.
  5. On repeated failures (e.g., Google Calendar API unavailability), backs off gracefully and logs the failure without throwing — ensuring the cron does not crash the NestJS process.
- **Cron Schedule**: Configurable via `CALENDAR_AUTO_SYNC_CRON` env var (default: `*/15 * * * *` — every 15 minutes).
- **Accessed Tables**: `local_calendars` (Read, Write), `calendar_sync_states` (Read, Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**: None (Triggered automatically by NestJS `@Cron()` scheduler)

- **Output**:
  - `Promise<void>`: Resolves silently after sync completes or fails gracefully. Sync results are emitted via application logger only.

