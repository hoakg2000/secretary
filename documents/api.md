# Secretary — API routes

Taken from the controllers in `server/src` (2026-10-13). **Swagger at `/api/docs` is the reference** for request
and response shapes; this file lists what exists and who may call it.

- Base path: `/api/v1` (global prefix). `GET /` is outside it.
- Auth: every route needs `Authorization: Bearer <access token>` unless marked **Public**
  (`JwtAuthGuard` is global; public routes carry `@Public()`).
- Responses are `{ statusCode, message, data }`.
- Constraint errors: duplicate → 409, missing row → 404, bad reference → 400.

## Auth — `/auth`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/auth/login` | Public | `email` + `password`. Returns `accessToken` + `user`; sets the `refreshToken` cookie. 5 per minute. |
| POST | `/auth/refresh` | Public | Refresh token from the cookie or `{ refreshToken }`. Rotates it: new cookie (or new `refreshToken` in the body when no cookie was used). Reusing a rotated token ends the session. |
| POST | `/auth/logout` | JWT | Ends the current session, or `{ sessionId }` to end another session of the same user. |
| GET | `/auth/session` | JWT | Current session and user. |
| GET | `/auth/google/connect` | JWT | Google consent URL carrying a signed `state` (valid 10 minutes). |
| GET | `/auth/google/callback` | Public | `code` + `state`. Stores the Google tokens encrypted. 400 on a missing or foreign `state`. |

## Characters — `/characters`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/characters` | JWT | Create. `isActive: true` deactivates the others. |
| GET | `/characters` | JWT | List with personas. |
| GET | `/characters/:id` | JWT | One character with personas. |
| PATCH | `/characters/:id` | JWT | Update. |
| DELETE | `/characters/:id` | JWT | Delete (personas cascade). |
| PATCH | `/characters/:id/active` | JWT | Make this the single active character. |
| POST | `/characters/:id/personas` | JWT | Add a persona. |
| PATCH | `/characters/:id/personas/:personaId` | JWT | Update a persona of that character (404 if it belongs to another). |
| DELETE | `/characters/:id/personas/:personaId` | JWT | Delete a persona of that character. |

## Email

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/email/ingest` | JWT | Manual ingest of one parsed email `{ messageId, sender, subject?, rawBody? }`. Duplicate `messageId` → 200 with `data: null`. Blacklisted → saved `SKIPPED`, not queued. |
| POST | `/email/pubsub` | Public + Google ID token | Gmail Pub/Sub push receiver. `Authorization: Bearer <ID token>` must be signed by Google for `PUBSUB_PUSH_AUDIENCE` and belong to `PUBSUB_PUSH_SERVICE_ACCOUNT`, else 401. Body `{ message: { data, messageId, publishTime? }, subscription? }`. Fetches new INBOX messages since the stored Gmail history ID and ingests each one; returns `data.fetched`. 503 when the three Pub/Sub variables are missing or a pass is already running; any non-2xx makes Pub/Sub redeliver, which is safe (duplicates are ignored). |
| POST | `/email-rules` | JWT | Create a rule (`type`, `matcher`, `matchValue`, `description?`, `isActive?`). Invalid regex → 400. |
| GET | `/email-rules` | JWT | List rules. |
| GET | `/email-rules/:id` | JWT | One rule. |
| PATCH | `/email-rules/:id` | JWT | Update a rule. |
| DELETE | `/email-rules/:id` | JWT | Delete a rule. |

Planned (not in the code): AI classification, `GET /email/logs`, reprocess, rule `type` filter.

## Finance — `/finance`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/finance/accounts` | JWT | Create an account (`cachedBalance` is the opening balance). |
| GET | `/finance/accounts?includeInactive=` | JWT | Active accounts; all with `includeInactive=true`. |
| GET | `/finance/accounts/total-balance` | JWT | `{ totals: [{ currency, totalBalance, totalAccounts }] }`, active accounts only. |
| GET | `/finance/accounts/:id` | JWT | Account with its 10 latest transactions. |
| PATCH | `/finance/accounts/:id` | JWT | Update name, bank, number, currency, `isActive`. **Not** the balance. |
| PATCH | `/finance/accounts/:id/balance` | JWT | `{ newBalance, note? }`. Records the difference as a transaction. |
| DELETE | `/finance/accounts/:id` | JWT | Deletes an account with no transactions; otherwise sets `isActive: false` and returns it. |
| POST | `/finance/categories` | JWT | Create a category. |
| GET | `/finance/categories?type=` | JWT | List, optional `INCOME` / `EXPENSE` filter. |
| DELETE | `/finance/categories/:id` | JWT | Delete a category. |
| POST | `/finance/transactions` | JWT | Create; balance moves atomically. 400 for an inactive account or a category of the other type. |
| POST | `/finance/transactions/search` | JWT | Filters + `page`, `pageSize` (max 100). Returns `{ items, total, page, pageSize }`. |
| GET | `/finance/transactions/:id` | JWT | One transaction. |
| DELETE | `/finance/transactions/:id` | JWT | Delete and reverse the balance movement. |

Planned: update transaction, update category, `GET /finance/summary`.

## Calendar — `/calendar`

Local is the source of truth; changes are pushed one way to Google.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/calendar` | JWT | Create an event (`endTime` must be after `startTime`). |
| GET | `/calendar?fromDate=&toDate=` | JWT | Events overlapping the range. |
| GET | `/calendar/:id` | JWT | One event. |
| PATCH | `/calendar/:id` | JWT | Update. |
| DELETE | `/calendar/:id` | JWT | Delete. A synced event is hidden at once and removed after the next sync deletes it on Google. |
| POST | `/calendar/sync` | JWT | Push now. Returns `{ pushed, deleted, removedRemotely, failed }`, or `data: null` when Google is not connected or a run is in progress. |

Planned: pull sync from Google, conflict handling.

## AI agent — `/ai-agent`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/ai-agent/chat/stream` | JWT | SSE over POST. Body `{ message, characterId?, history?: [{ role: 'user' \| 'model', text }] }` (max 20 turns). |
| POST | `/ai-agent/actions/:actionId/confirm` | JWT | Run a write action the AI proposed. 404 if unknown, used or older than 5 minutes. |
| DELETE | `/ai-agent/actions/:actionId` | JWT | Discard a proposed action. |
| POST | `/ai-agent/memories` | JWT | Save a memory. |
| GET | `/ai-agent/memories?category=&source=&page=&pageSize=` | JWT | List, newest first (`pageSize` max 50). |
| DELETE | `/ai-agent/memories/:id` | JWT | Delete a memory. |
| POST | `/ai-agent/memories/search` | JWT | Hybrid search `{ query, category?, source?, limit? (1–20), minScore? (0–1, default 0.5) }`. |
| POST | `/ai-agent/tts` | JWT | MP3 stream. 503 without `FISH_AUDIO_API_KEY`, 400 when no voice resolves. |

Chat stream frames (`data:` lines, JSON):

| `type` | Fields | Meaning |
|--------|--------|---------|
| `text` | `content` | A chunk of the answer. |
| `tool_call` | `tool`, `args` | A read tool is running. |
| `tool_result` | `tool`, `result` | Its result. |
| `confirmation_required` | `actionId`, `tool`, `args` | A write tool was proposed, **not run**. Confirm or discard via the action routes. |
| `error` | `message` | The stream stops (includes the 5-round tool limit). |
| `done` | — | Normal end. |

AI tools (confirmation = not executed inside the chat):

| Tool | Confirmation |
|------|--------------|
| `get_financial_summary`, `search_financial_transactions` | no |
| `create_financial_transaction` | **yes** |
| `get_calendar_events`, `create_calendar_event` | no |
| `update_calendar_event`, `delete_calendar_event` | **yes** |
| `search_semantic_memory`, `save_user_memory` | no |
| `send_proactive_notification` | **yes** |

## Proactive — `/proactive`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/proactive/trigger` | JWT | `{ type, message, channel?, metadata? }`. Sends `message` as Telegram text (`channel` is `TELEGRAM` only). `data.result.status` is `SENT`, `FAILED` or `NOT_CONFIGURED` (bot token or chat ID missing); `data.success` is `true` only for `SENT`. |

## Other

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/` | Public | Hello. |
| GET | `/api/docs` | Public | Swagger UI. |
