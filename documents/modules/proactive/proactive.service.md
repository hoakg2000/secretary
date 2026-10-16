# Proactive Service

- **Class**: `ProactiveService` — `server/src/proactive/proactive.service.ts`; `TelegramClient` — `server/src/proactive/telegram.client.ts`
- **Description**: dispatches a text notification to Telegram, runs a reminder cron for upcoming calendar events, and
  exposes one AI tool.
- **Tables**: `local_calendars` (read; update `reminded_at`).
- **Callers**: `ProactiveController`, `EmailProcessor` (urgent mail, `URGENT_EVENT`), `AgentService` (AI tool), the cron
  inside this class.

Status tags: `[Implemented]` = in the code today. `[Planned]` = designed, not built. `[De-scoped]` = decided against; never flip it to `[Implemented]` without the owner.

## Change log

| Date | Change |
|------|--------|
| 2026-10-16 | First version, written from the code. Covers `evaluateAndTrigger`, the reminder cron and its `reminded_at` rule, the AI tool and its confirmation flag, and the `TelegramClient` statuses. |

---

## ProactiveService

### 1. evaluateAndTrigger(dto) `[Implemented]`

- Builds a payload `{ type, message, channel (default TELEGRAM), metadata (default {}), timestamp }` and sends
  `message` through `TelegramClient.sendMessage`.
- Returns `{ success, channel, payload, result: { status, at } }`. `success` is `true` only for `SENT`.
- It never throws on a delivery problem; the status says what happened. A caller that must retry reads `success`.

### 2. handleFallbackCron() `[Implemented]`

- Schedule: `@Cron(CronExpression.EVERY_10_MINUTES)`. Not configurable by an env var.
- Selects `local_calendars` rows with `start_time` between now and now + 15 minutes, `reminded_at` null and
  `deleted_at` null. Rows of every user are read; the notification goes to the one configured Telegram chat.
- For each row it calls `evaluateAndTrigger` with `type: SCHEDULED_REMINDER`, `channel: TELEGRAM`, `metadata: { eventId, title }`
  and a Vietnamese text with the title and the start time formatted for `APP_TIMEZONE`.
- `reminded_at = now` is written only when `success` is true. A failed send leaves it null, so the next run tries again.
- `CalendarService.updateEvent` resets `reminded_at` to null when `start_time` changes, so a moved event is reminded again.

### 3. aiSendProactiveNotification(dto) `[Implemented]`

- AI tool method; calls `evaluateAndTrigger(dto)`.

## TelegramClient

### 4. sendMessage(text) `[Implemented]`

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
