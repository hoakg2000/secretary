# Email BullMQ Worker

- **Class**: `EmailProcessor` — `server/src/email/email.processor.ts`
- **Queue**: `email-processing`, job name `process-email-job`
- **Description**: consumes one email job at a time: asks `EmailAiService` to classify the email, turns the answer
  into a transaction or a calendar event, stores the summary, and sends an urgent notice. Job state lives in Redis;
  `queue_jobs` is not used.
- **Tables**: `email_logs` (read, update), `bank_accounts` (read), `transactions` and `local_calendars` (written through
  `FinanceService` and `CalendarService`).

---

## Configuration

| Property | Value |
|----------|-------|
| Queue | `email-processing` |
| Concurrency | `BULLMQ_CONCURRENCY` (default 3), applied at application bootstrap |
| Attempts | 3, set by `EmailService.enqueue` (used by `ingest` and `reprocess`) |
| Backoff | exponential, first delay 5 s |
| Job ID | the `email_logs` ID: one job per email log |
| Retention | last 100 completed, last 50 failed jobs |
| Priority | moneylist 1, whitelist 2, no rule 3 |

Job data `ProcessEmailJobData`: `emailLogId`, `messageId`, `sender`, `subject?`, `rawBody?`, `ruleType`
(`moneylist` | `whitelist` | `null`; `blacklist` never reaches the queue).

## `process(job)`

1. If the `email_logs` row is already `PROCESSED`, return at once: no model call, nothing created again.
2. `EmailAiService.classify({ sender, subject, rawBody }, ruleType)`.
3. By the model's category:
   - `TRANSACTION` with a `transaction` object: `createTransaction`.
   - `EVENT` with an `event` object: `createEvent`.
   - `OTHER`: nothing else.
4. Set `email_logs.status = PROCESSED` and `ai_summary = summary`.
5. If `urgent`: `ProactiveService.evaluateAndTrigger({ type: URGENT_EVENT, message })` (Telegram text). A failed
   delivery is logged and not retried, because a retry would call the model again.

### createTransaction

- Finds active `bank_accounts` by `accountNumber` (exact) and/or `bankCode` (case-insensitive). It acts only when **exactly one**
  account matches and the extracted currency, if any, equals the account's currency. Otherwise it only logs a warning and
  the summary is kept.
- Builds `CreateTransactionDto` (`type` = the model's `direction`, `note` = summary, `transactionTime` = extracted time or now,
  `emailLogId`) and validates it; an invalid object is logged and skipped.
- Calls `FinanceService.createTransaction`. A unique violation on `transactions.email_log_id` (a retry after success) is
  treated as done.

### createEvent

- Builds `CreateEventDto` (`description` = summary, `endTime` = extracted end or start + 1 hour), validates it, and calls
  `CalendarService.createEvent`. A `BadRequestException` (for example end before start) is logged and not retried.
- Known limit: if the status update in step 4 fails, a retry creates the event a second time. A unique
  `local_calendars.email_log_id` would close it.

## Failure handling

`@OnWorkerEvent('failed')` logs each failure. After the last attempt (3) it sets `email_logs.status = FAILED`; an error in that
update is logged and does not hide the original one. A `FAILED` email can be queued again with
`POST /email/logs/:id/reprocess` (`email.service.md`).
