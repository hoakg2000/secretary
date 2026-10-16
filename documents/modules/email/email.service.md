# Email Services

- **Module**: `EmailModule` — `server/src/email/email.module.ts`
- **Description**: ingest of emails (manual and from Gmail push), rule matching, queueing, and the AI classification
  call. The queue consumer is documented in `email.worker.md`.

| Class | File (under `server/src/email/`) | Role | Status |
|-------|----------------------------------|------|--------|
| `EmailService` | `email.service.ts` | Saves the `email_logs` row, classifies by rule, enqueues. | `[Implemented]` |
| `EmailRuleService` | `email-rule.service.ts` | CRUD and matching of `email_rules`. | `[Implemented]` |
| `GmailPushService` | `gmail-push.service.ts` | Pub/Sub token check, Gmail watch, history pass. | `[Implemented]` |
| `EmailAiService` | `email-ai.service.ts` | One Gemini call per email, JSON answer, no tools. | `[Implemented]` |
| `EmailProcessor` | `email.processor.ts` | BullMQ consumer: see `email.worker.md`. | `[Implemented]` |

**Tables**: `email_logs`, `email_rules`, `users` (`gmail_history_id`, Google tokens). Written downstream by the
worker: `transactions`, `local_calendars`.

Status tags: `[Implemented]` = in the code today. `[Planned]` = designed, not built.

## Change log

| Date | Change |
|------|--------|
| 2026-10-16 | Rewritten from the code. Dedup is the unique `message_id` only: no SHA-256 hash, no `deduplicationHash`. Job state is in Redis, `queue_jobs` is unused. Priorities: moneylist 1, whitelist 2, no rule 3 (was MoneyList 2). Added `GmailPushService`, `EmailAiService` and the re-enqueue of a duplicate that is still `PENDING`. No AI tool in this module. |
| 2026-10-16 | Review fix: method headings tagged `[Implemented]`. |

---

## EmailService

Not an AI tool in any method.

### 1. createEmailLog(dto) `[Implemented]`

- Inserts an `email_logs` row with status `PENDING`. A unique violation on `message_id` (Prisma `P2002`) means
  "already ingested": the method returns `null`. Insert-then-catch, not check-then-insert.

### 2. ingest(dto) `[Implemented]`

1. `createEmailLog`. On a duplicate, read the existing row: when it is not `PENDING`, return `null`; when it is still
   `PENDING` (an earlier call failed before queueing), continue with that row.
2. `EmailRuleService.classify` returns `blacklist`, `moneylist`, `whitelist` or `null`.
3. `blacklist` → status `SKIPPED`, nothing queued, `jobId: null`.
4. Otherwise `emailQueue.add('process-email-job', …)` on queue `email-processing`: `jobId` = the email log ID (a repeat
   add is ignored by BullMQ), `attempts: 3`, exponential backoff from 5 s, keeps the last 100 completed and 50 failed
   jobs. BullMQ `priority`: moneylist 1, whitelist 2, no rule 3 (lower runs first).
5. Returns `{ emailLogId, jobId, ruleType, status }`.

- **Tables**: `email_logs` (create, read, update), `email_rules` (read).

### 3. updateEmailStatus(id, status) `[Implemented]`

- Updates `email_logs.status`.

---

## EmailRuleService

- `create`, `findAll` (newest first), `findOne` (`NotFoundException`), `update`, `remove`.
- `create` / `update`: for `matcher = regex`, `matchValue` must be at most 200 characters and compile as a regular
  expression, otherwise `BadRequestException`. Known limit: no protection against catastrophic backtracking.
- `classify(email)`: loads active rules, keeps those that match, returns the type of highest precedence
  (blacklist > moneylist > whitelist) or `null`.
  - `sender`: case-insensitive substring of the sender.
  - `keyword`: case-insensitive substring of subject + body.
  - `regex`: case-insensitive test on sender + subject + body; an invalid stored regex counts as no match.

---

## GmailPushService

- `onApplicationBootstrap`: registers a cron at 03:00 daily and calls `renewWatch` once at startup.
- `renewWatch()`: when `GMAIL_PUBSUB_TOPIC` is set and Google is connected, calls Gmail `users.watch` on `INBOX`. Stores
  the returned history ID in `users.gmail_history_id` only when none is stored. Errors are logged, not thrown.
- `verifyPushToken(authorization)`: 503 unless the topic, audience and service account are all configured; 401 for a
  missing or invalid Google ID token, a wrong audience, or an `email` other than `PUBSUB_PUSH_SERVICE_ACCOUNT` or not
  verified.
- `runPass()`: one pass at a time (a second concurrent call → 503). Reads new messages from the **stored** history ID,
  not the one in the push body. Falls back to the INBOX messages of the last day when there is no history ID or Google
  answers 404 for it. Each message goes to `EmailService.ingest` (`Message-ID` header, else the Gmail ID; `From`;
  `Subject`; `text/plain` body, else tag-stripped `text/html`). The new history ID is saved only after the whole pass
  succeeds. Returns the number of messages read. Without a connected Google account it returns 0 (acknowledged).
- Not yet run against the real Gmail and Pub/Sub services.

---

## EmailAiService

- `classify(email, ruleType)`: one `generateContent` call (`CHAT_MODEL`, `gemini-2.5-flash`) with a JSON response
  schema and **no tools**. The email is the only untrusted input: it is wrapped between random-ID boundary lines, the
  body is cut at 20 000 characters, and the system instruction tells the model to describe, never follow, its content.
- The rule type only selects the task text: `moneylist` (expect a bank notice), `whitelist` (important sender, judge
  `urgent`, prefer `EVENT` for invitations), no rule (model decides). `blacklist` never reaches it.
- Result `EmailClassification`: `category` (`TRANSACTION` | `EVENT` | `OTHER`), `urgent`, `summary` (Vietnamese, at most
  three sentences), optional `transaction` (`amount`, `direction`, `currency`, `accountNumber`, `bankCode`,
  `counterparty`, `time`) and `event` (`title`, `start`, `end`, `location`).
- An answer of the wrong shape throws, so the job is retried.
