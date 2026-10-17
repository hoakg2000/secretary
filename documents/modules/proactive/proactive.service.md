# Proactive Service

- **Module**: `ProactiveModule` — `server/src/proactive/proactive.module.ts`
- **Description**: dispatches a text notification to Telegram, runs a reminder cron for upcoming calendar events, and
  exposes one AI tool.

| Class | File (under `server/src/proactive/`) | Role |
|-------|--------------------------------------|------|
| `ProactiveService` | `proactive.service.ts` | Dispatch, reminder cron, the AI tool. |
| `TelegramClient` | `telegram.client.ts` | Telegram Bot API call and its statuses. |

- **Tables**: `local_calendars` (read; update `reminded_at`).
- **Callers**: `ProactiveController`, `EmailProcessor` (urgent mail, `URGENT_EVENT`), `AgentService` (AI tool), the cron
  inside this class.

---

## ProactiveService

### 1. evaluateAndTrigger(dto)

- Builds a payload `{ type, message, channel (default TELEGRAM), metadata (default {}), timestamp }` and sends
  `message` through `TelegramClient.sendMessage`.
- Returns `{ success, channel, payload, result: { status, at } }`. `success` is `true` only for `SENT`.
- It never throws on a delivery problem; the status says what happened. A caller that must retry reads `success`.

### 2. handleFallbackCron()

- Schedule: `@Cron(CronExpression.EVERY_10_MINUTES)`, in the server's local time (not `APP_TIMEZONE`). Not configurable by an env var.
- Selects `local_calendars` rows with `start_time` between now and now + 15 minutes, `reminded_at` null and
  `deleted_at` null. All rows are read (the calendar has no owner column); the notification goes to the one configured Telegram chat.
- For each row it calls `evaluateAndTrigger` with `type: SCHEDULED_REMINDER`, `channel: TELEGRAM`, `metadata: { eventId, title }`
  and a Vietnamese text with the title and the start time formatted for `APP_TIMEZONE`.
- `reminded_at = now` is written only when `success` is true. A failed send leaves it null, so the next run tries again.
- `CalendarService.updateEvent` resets `reminded_at` to null when `start_time` changes, so a moved event is reminded again.

### 3. aiSendProactiveNotification(dto)

- AI tool method; calls `evaluateAndTrigger(dto)`.

## TelegramClient

### 4. sendMessage(text)

- Reads `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`. Either missing → `NOT_CONFIGURED`, no request.
- `POST https://api.telegram.org/bot<token>/sendMessage` with `{ chat_id, text }`, 10-second timeout. Plain text only.
- 2xx → `SENT`. A non-2xx answer or a network error → `FAILED`. The Telegram error body is logged, not returned. The bot
  token is never logged (only the error name is).

---

## AI tools

| Tool | Method | Confirmation | Parameters |
|------|--------|--------------|------------|
| `send_proactive_notification` | `aiSendProactiveNotification(dto)` | **yes** | `TriggerProactiveDto`: `type` (required), `message` (required), `channel?`. `metadata` is not declared to the model. |

The call is parked in `PendingActionStore` and runs only after `POST /ai-agent/actions/:actionId/confirm`.
