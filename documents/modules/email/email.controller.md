# Email Controller

- **Class**: `EmailController` — `server/src/email/email.controller.ts`
- **Base endpoint**: `/api/v1` (routes under `/email/...` and `/email-rules/...`)
- **Auth**: global `JwtAuthGuard`. `POST /email/pubsub` is `@Public()` and is protected by a Google ID token instead.
- **Response**: `{ statusCode, message, data }`.
- **Description**: manual email ingest, the Gmail Pub/Sub push receiver, and CRUD of email rules
  (blacklist / moneylist / whitelist).

Status tags: `[Implemented]` = in the code today. `[Planned]` = designed, not built.

## Change log

| Date | Change |
|------|--------|
| 2026-10-16 | Rewritten from the code. The Pub/Sub receiver is `POST /email/pubsub` with a Google ID token check (was `POST /email/webhooks/google-pubsub` with a shared secret). Added `POST /email/ingest`. Rules live at `/email-rules`, `PATCH` for update. Dedup is on `message_id` only (no `deduplicationHash`). `GET /email/logs` and reprocess are `[Planned]`. |

---

## Endpoints

### 1. Manual ingest — `POST /api/v1/email/ingest` `[Implemented]`

- **Handler**: `ingestEmail(dto)` → `EmailService.ingest`. Returns 200.
- **Auth**: JWT.
- **Request** `EmailWebhookDto`: `messageId` (required, the email's `Message-ID`), `sender` (required), `subject?`,
  `rawBody?`.
- **Response `data`**: `{ emailLogId, jobId, ruleType, status }`. Blacklisted → `status: SKIPPED`, `jobId: null`,
  nothing queued. Otherwise `status: PENDING` and the job ID.
- A duplicate `messageId` that is already past `PENDING` → 200 with `data: null`. A duplicate still `PENDING` is
  queued again (see `email.service.md`).

### 2. Gmail Pub/Sub push — `POST /api/v1/email/pubsub` `[Implemented]`

- **Handler**: `gmailPush(authorization, dto)` → `GmailPushService.verifyPushToken`, then `runPass`.
- **Auth**: `@Public()`. `Authorization: Bearer <ID token>` must be signed by Google for `PUBSUB_PUSH_AUDIENCE`, its
  `email` must equal `PUBSUB_PUSH_SERVICE_ACCOUNT` and be verified; otherwise 401.
- **Request** `PubSubPushDto`: `message: { data, messageId, publishTime? }`, `subscription?`. The body is validated
  but not used: the pass reads Gmail history from the stored history ID.
- **Response `data`**: `{ fetched }`, the number of messages read from Gmail.
- 503 when `GMAIL_PUBSUB_TOPIC`, `PUBSUB_PUSH_AUDIENCE` or `PUBSUB_PUSH_SERVICE_ACCOUNT` is missing, or a pass is
  already running. Any non-2xx makes Pub/Sub redeliver; this is safe because duplicates are ignored.

### 3. Create a rule — `POST /api/v1/email-rules` `[Implemented]`

- **Handler**: `createRule(dto)` → `EmailRuleService.create`. Returns 201.
- **Request** `CreateEmailRuleDto`: `type` (`blacklist` | `moneylist` | `whitelist`), `matcher` (`sender` | `keyword` |
  `regex`), `matchValue` (all required), `description?`, `isActive?` (default true).
- A `regex` longer than 200 characters or with invalid syntax → 400.

### 4. List rules — `GET /api/v1/email-rules` `[Implemented]`

- **Handler**: `findAllRules()`. Newest first, no pagination, no filter.

### 5. Get a rule — `GET /api/v1/email-rules/:id` `[Implemented]`

- **Handler**: `findOneRule(id)`. 404 when missing.

### 6. Update a rule — `PATCH /api/v1/email-rules/:id` `[Implemented]`

- **Handler**: `updateRule(id, dto)`. **Request** `UpdateEmailRuleDto`: every field of the create DTO, optional.
  The regex check uses the stored value for a field not sent. 404 when missing.

### 7. Delete a rule — `DELETE /api/v1/email-rules/:id` `[Implemented]`

- **Handler**: `removeRule(id)`. 404 when missing. `data: null`.

---

## Not built `[Planned]`

- `GET /email/logs` and reprocess of a failed email.
- A `type` filter on `GET /email-rules`.
