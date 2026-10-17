# Secretary — API routes

Taken from the controllers in `server/src` (last checked 2026-10-17). **Swagger at `/api/docs` is the reference** for request
and response shapes; this file lists what exists and who may call it.

- Base path: `/api/v1` (global prefix). `GET /` and `/api/docs` are outside it.
- Auth: every route needs `Authorization: Bearer <access token>` unless marked **Public**
  (`JwtAuthGuard` is global; public routes carry `@Public()`).
- Success responses are `{ statusCode, message, data }` (logout has no `data`; the chat stream is SSE and TTS is MP3). Errors use Nest's default `{ statusCode, message, error }`.
- Constraint errors: duplicate → 409, missing row → 404, bad reference → 400.
- Body validation (`ValidationPipe`, `whitelist`) silently strips unknown fields; it does not reject them. A field that fails validation is 400.
- Routes that are not built are listed in `summary.md` section 3.

## Auth — `/auth`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/auth/login` | Public | `email` + `password`. Returns `accessToken` + `user`; sets the `refreshToken` cookie. 5 per minute. |
| POST | `/auth/refresh` | Public | Refresh token from the cookie or `{ refreshToken }`. Rotates it: always sets a new cookie, and also returns the new `refreshToken` in the body when the request had no cookie. Reusing a rotated token ends the session. |
| POST | `/auth/logout` | JWT | Ends the current session, or `{ sessionId }` to end another session of the same user. |
| GET | `/auth/session` | JWT | Current session and user. |
| GET | `/auth/google/connect` | JWT | Google consent URL carrying a signed `state` (valid 10 minutes). |
| GET | `/auth/google/callback` | Public | `code` + `state`. Stores the Google tokens encrypted. 400 for a missing `code`, an invalid, expired or wrong-type `state`, or when Google returns no access token. |

## Characters — `/characters`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/characters` | JWT | Create. `memoryRule?` (max 2000 characters) tells the AI which chat messages to remember. |
| GET | `/characters` | JWT | List with personas. |
| GET | `/characters/:id` | JWT | One character with personas. |
| PATCH | `/characters/:id` | JWT | Update. |
| DELETE | `/characters/:id` | JWT | Delete (personas cascade). |
| POST | `/characters/:id/personas` | JWT | Add a persona. |
| PATCH | `/characters/:id/personas/:personaId` | JWT | Update a persona of that character (404 if it belongs to another). |
| DELETE | `/characters/:id/personas/:personaId` | JWT | Delete a persona of that character. |

## Email

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/email/ingest` | JWT | Manual ingest of one parsed email `{ messageId, sender, subject?, rawBody? }`. Duplicate `messageId` already past `PENDING` → 200 with `data: null`; a duplicate still `PENDING` is queued again. Blacklisted → saved `SKIPPED`, not queued. |
| GET | `/email/logs?status=&page=&pageSize=` | JWT | Email logs, newest first (`pageSize` max 50). Full rows, including `rawBody`. `status` is `PENDING`, `PROCESSED`, `FAILED` or `SKIPPED`. |
| POST | `/email/logs/:id/reprocess` | JWT | Queue a `FAILED` email again. 404 for an unknown log, 400 when its status is not `FAILED`. The email is classified again: a blacklist match → `SKIPPED`, else `PENDING` with a new job. |
| POST | `/email/pubsub` | Public + Google ID token | Gmail Pub/Sub push receiver. `Authorization: Bearer <ID token>` must be signed by Google for `PUBSUB_PUSH_AUDIENCE` and belong to `PUBSUB_PUSH_SERVICE_ACCOUNT`, else 401. Body `{ message: { data, messageId, publishTime? }, subscription? }`. Fetches new INBOX messages since the stored Gmail history ID and ingests each one; returns `data.fetched`. 503 when any of the three Pub/Sub variables is missing or a pass is already running; a body that fails validation is 400 (before the token is checked); any non-2xx makes Pub/Sub redeliver, which is safe (duplicates are ignored). |
| POST | `/email-rules` | JWT | Create a rule (`type`, `matcher`, `matchValue`, `description?`, `isActive?`). Invalid regex → 400. |
| GET | `/email-rules?type=` | JWT | List rules, optional `blacklist` / `moneylist` / `whitelist` filter (other value → 400). |
| GET | `/email-rules/:id` | JWT | One rule. |
| PATCH | `/email-rules/:id` | JWT | Update a rule. |
| DELETE | `/email-rules/:id` | JWT | Delete a rule. |

Every queued email is classified by one Gemini call without tools (the rule type only selects the prompt): the
model's category `TRANSACTION` creates a transaction when exactly one active account matches the extracted account
number and/or bank code (and the currency, when one is extracted), `EVENT` creates a calendar event, `urgent` sends a proactive notification; the
summary is stored in `email_logs.ai_summary` and the status becomes `PROCESSED`. Blacklisted mail never reaches the
model.

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
| PATCH | `/finance/categories/:id` | JWT | Update `name`, `icon`, `budgetLimit`. `type` cannot change. 404 when missing. |
| DELETE | `/finance/categories/:id` | JWT | Delete a category. |
| POST | `/finance/transactions` | JWT | Create; balance moves atomically. 400 for an inactive account or a category of the other type. |
| POST | `/finance/transactions/search` | JWT | Filters + `page`, `pageSize` (max 100). Returns `{ items, total, page, pageSize }`. |
| GET | `/finance/summary?startDate=&endDate=&accountId=` | JWT | `{ totals: [{ currency, income, expense, net }] }`; dates inclusive, UTC. |
| GET | `/finance/transactions/:id` | JWT | One transaction. |
| PATCH | `/finance/transactions/:id` | JWT | Update the create fields except `emailLogId`; balances are corrected atomically, also when the account changes. `categoryId: null` removes the category. 404 for an unknown transaction, account or category; 400 for a different inactive account or a category of the other type. |
| DELETE | `/finance/transactions/:id` | JWT | Delete and reverse the balance movement. |

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

## AI agent — `/ai-agent`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/ai-agent/chat/stream` | JWT | SSE over POST. Body `{ message, sessionId?, characterId? }`. No `sessionId` → a session is created and `characterId` is required: missing → 400, unknown → 404. A `sessionId` that is unknown or belongs to another user → 404. All errors come before the stream opens, with no model call. With a `sessionId` the session's stored character is used and `characterId` is ignored (a deleted character → generic prompt). Storage: `db.md` section 5. The answer is a bilingual JSON reply; `text` frames carry the Vietnamese text and a `reply` frame carries the message ID and the Japanese text. Frames: `modules/ai/ai.controller.md`. |
| GET | `/ai-agent/sessions?page=&pageSize=` | JWT | Own sessions, newest `lastMessageAt` first (`pageSize` max 50). |
| GET | `/ai-agent/sessions/:id/messages?page=&pageSize=` | JWT | Messages of an own session, oldest first (full rows: `id`, `sessionId`, `role` (`USER` / `MODEL`), `content`, `contentJp`, `toolCalls`, `memoryId`, `createdAt`). 404 for an unknown or foreign session. |
| DELETE | `/ai-agent/sessions/:id` | JWT | Delete an own session and its messages. Memories made from them are kept. |
| POST | `/ai-agent/actions/:actionId/confirm` | JWT | Run a write action the AI proposed. 404 if unknown, used or older than 5 minutes. |
| DELETE | `/ai-agent/actions/:actionId` | JWT | Discard a proposed action. 404 if unknown, used or older than 5 minutes. |
| POST | `/ai-agent/memories` | JWT | Save a memory. |
| GET | `/ai-agent/memories?category=&source=&page=&pageSize=` | JWT | List, newest first (`pageSize` max 50). |
| PATCH | `/ai-agent/memories/:id` | JWT | Update `content` and/or `category`. New `content` rebuilds the embedding and full-text vector. `category: null` clears it. 404 if unknown. |
| DELETE | `/ai-agent/memories/:id` | JWT | Delete a memory. 404 if unknown. |
| POST | `/ai-agent/memories/search` | JWT | Hybrid search `{ query, category?, source?, limit? (1–20), minScore? (0–1, default 0.5) }`. |
| POST | `/ai-agent/tts` | JWT | MP3 stream of the Japanese text (`contentJp`) of the stored message `{ messageId }`. Voice: the `voice_id` of the message's session character. 503 without `FISH_AUDIO_API_KEY` (checked first), 404 for an unknown or foreign message, 400 when the character is deleted or has no `voice_id` or the message has no Japanese text (`contentJp` null or blank). |

Where the details live: chat stream frames in `modules/ai/ai.controller.md`, the AI tools in `modules/ai/ai.service.md`, the chat storage rules in `db.md` section 5.

## Proactive — `/proactive`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/proactive/trigger` | JWT | `{ type, message, channel?, metadata? }`; `type` is `URGENT_EVENT`, `INACTIVITY_FALLBACK`, `SCHEDULED_REMINDER` or `CUSTOM`. Sends `message` as Telegram text (`channel` is `TELEGRAM` only). `data.result.status` is `SENT`, `FAILED` or `NOT_CONFIGURED` (bot token or chat ID missing); `data.success` is `true` only for `SENT`. |

## Other

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/` | Public | Hello. |
| GET | `/api/docs` | Public | Swagger UI. |
