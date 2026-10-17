# Proactive Controller

- **Class**: `ProactiveController` — `server/src/proactive/proactive.controller.ts`
- **Base endpoint**: `/api/v1/proactive`
- **Auth**: every route needs the application JWT (global `JwtAuthGuard`).
- **Response**: `{ statusCode, message, data }`.
- **Description**: sends one text notification to the owner through Telegram. The same dispatch is used by the reminder
  cron, the email worker (urgent mail) and the AI tool `send_proactive_notification`.

---

## Endpoints

### 1. Trigger a notification — `POST /api/v1/proactive/trigger`

- **Handler**: `triggerProactive(dto)` → `ProactiveService.evaluateAndTrigger`. Returns 200.
- **Request** `TriggerProactiveDto`:
  - `type` (enum, required): `URGENT_EVENT`, `INACTIVITY_FALLBACK`, `SCHEDULED_REMINDER` or `CUSTOM`. It is logged and
    echoed in `payload`; it does not change the delivery.
  - `message` (string, required, not empty): the text sent to Telegram.
  - `channel?` (enum, default `TELEGRAM`): `TELEGRAM` is the only value.
  - `metadata?` (object): echoed in `payload`; not sent to Telegram.
- **Response `data`**: `{ success, channel, payload, result }`.
  - `success`: `true` only when `result.status` is `SENT`.
  - `payload`: `{ type, message, channel, metadata, timestamp }` (`metadata` is `{}` when missing).
  - `result`: `{ status, at }`. `status` is `SENT` (Telegram answered 2xx), `FAILED` (Telegram error, timeout or
    network error) or `NOT_CONFIGURED` (`TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID` missing).
- Errors: 400 for a bad `type`, `channel` or an empty `message`; 401 without a valid JWT. A `FAILED` or `NOT_CONFIGURED`
  delivery is still HTTP 200; read `data.result.status`.
