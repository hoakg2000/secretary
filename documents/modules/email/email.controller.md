# Email Controller

- **Class**: `EmailController` — `server/src/email/email.controller.ts`
- **Base endpoint**: `/api/v1` (routes under `/email/...` and `/email-rules/...`)
- **Auth**: global `JwtAuthGuard`. `POST /email/pubsub` is `@Public()` and is protected by a Google ID token instead.
- **Response**: `{ statusCode, message, data }`.
- **Description**: manual email ingest, the email log list and reprocess of a failed email, the Gmail Pub/Sub push
  receiver, and CRUD of email rules (blacklist / moneylist / whitelist).

---

## Endpoints

### 1. Manual ingest — `POST /api/v1/email/ingest`

- **Handler**: `ingestEmail(dto)` → `EmailService.ingest`. Returns 200.
- **Auth**: JWT.
- **Request** `EmailWebhookDto`: `messageId` (required, the email's `Message-ID`), `sender` (required), `subject?`,
  `rawBody?`.
- **Response `data`**: `{ emailLogId, jobId, ruleType, status }`. Blacklisted → `status: SKIPPED`, `jobId: null`,
  nothing queued. Otherwise `status: PENDING` and the job ID.
- A duplicate `messageId` that is already past `PENDING` → 200 with `data: null`. A duplicate still `PENDING` is
  queued again (see `email.service.md`).

### 2. List email logs — `GET /api/v1/email/logs`

- **Handler**: `listLogs(dto)` → `EmailService.listLogs`. Returns 200.
- **Query** `ListEmailLogDto`: `status?` (`EmailStatus`: `PENDING`, `PROCESSED`, `FAILED`, `SKIPPED`), `page?` (min 1,
  default 1), `pageSize?` (1–50, default 20).
- **Response `data`**: `{ items, total, page, pageSize }`; newest `created_at` first. Items are full `email_logs`
  rows, including `rawBody`.

### 3. Reprocess a failed email — `POST /api/v1/email/logs/:id/reprocess`

- **Handler**: `reprocess(id)` → `EmailService.reprocess`. Returns 200.
- 404 when the log does not exist. 400 when its status is not `FAILED`.
- **Response `data`**: `{ emailLogId, jobId, ruleType, status }`, as for the manual ingest. A blacklisted email →
  `status: SKIPPED`, `jobId: null`. Otherwise `status: PENDING` and a new job.
- If queueing fails, the status returns to `FAILED` and the error is thrown. Steps: `email.service.md`.

### 4. Gmail Pub/Sub push — `POST /api/v1/email/pubsub`

- **Handler**: `gmailPush(authorization, dto)` → `GmailPushService.verifyPushToken`, then `runPass`.
- **Auth**: `@Public()`. `Authorization: Bearer <ID token>` must be signed by Google for `PUBSUB_PUSH_AUDIENCE`, its
  `email` must equal `PUBSUB_PUSH_SERVICE_ACCOUNT` and be verified; otherwise 401.
- **Request** `PubSubPushDto`: `message: { data, messageId, publishTime? }`, `subscription?`. The body is validated
  but not used: the pass reads Gmail history from the stored history ID.
- **Response `data`**: `{ fetched }`, the number of messages read from Gmail.
- A body that fails `PubSubPushDto` validation is 400, before the token is checked.
- 503 when `GMAIL_PUBSUB_TOPIC`, `PUBSUB_PUSH_AUDIENCE` or `PUBSUB_PUSH_SERVICE_ACCOUNT` is missing, or a pass is
  already running. Any non-2xx makes Pub/Sub redeliver; this is safe because duplicates are ignored.

### 5. Create a rule — `POST /api/v1/email-rules`

- **Handler**: `createRule(dto)` → `EmailRuleService.create`. Returns 201.
- **Request** `CreateEmailRuleDto`: `type` (`blacklist` | `moneylist` | `whitelist`), `matcher` (`sender` | `keyword` |
  `regex`), `matchValue` (all required), `description?`, `isActive?` (default true).
- A `regex` longer than 200 characters or with invalid syntax → 400.

### 6. List rules — `GET /api/v1/email-rules`

- **Handler**: `findAllRules(type?)`. Newest first, no pagination. Optional query `type` (`blacklist` | `moneylist` |
  `whitelist`); any other value → 400.

### 7. Get a rule — `GET /api/v1/email-rules/:id`

- **Handler**: `findOneRule(id)`. 404 when missing.

### 8. Update a rule — `PATCH /api/v1/email-rules/:id`

- **Handler**: `updateRule(id, dto)`. **Request** `UpdateEmailRuleDto`: every field of the create DTO, optional.
  The regex check uses the stored value for a field not sent. 404 when missing.

### 9. Delete a rule — `DELETE /api/v1/email-rules/:id`

- **Handler**: `removeRule(id)`. 404 when missing. `data: null`.
