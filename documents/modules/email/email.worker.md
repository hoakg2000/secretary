# Email BullMQ Worker

- **Class Name**: `EmailBullmqProcessor`
- **Queue Name**: `email-processing-queue`
- **General Description**: BullMQ Consumer Processor class responsible for consuming email processing jobs from the `email-processing-queue`, orchestrating the AI classification pipeline, dispatching results to downstream services (FinanceService, CalendarService, Telegram alerts), and maintaining job execution state in `queue_jobs`.
- **Accessed Database Tables**:
  - `email_logs`
  - `queue_jobs`
- **Cross-References**:
  - `(Ref: modules/email/email.service.md)` — `processPubSubWebhook` enqueues jobs consumed by this worker.
  - `(Ref: modules/finance/finance.service.md)` — `createTransaction` is invoked for Category 1 (Balance Fluctuation) emails.
  - `(Ref: modules/calendar/calendar.service.md)` — `createEvent` is invoked for Category 2 (Schedules & Appointments) emails.

---

## Worker Configuration

| Property | Value |
| :--- | :--- |
| **Queue** | `email-processing-queue` |
| **Concurrency** | Configurable via `BULLMQ_CONCURRENCY` env var (default: 3) |
| **Max Retries** | 3 attempts |
| **Backoff Strategy** | Exponential backoff (delay doubles per retry) |
| **Job Timeout** | 120 seconds |
| **Remove on Complete** | Keep last 100 completed jobs |
| **Remove on Fail** | Keep last 50 failed jobs |

---

## List of Methods

### 1. process (Main Job Handler)

- **Decorator**: `@Process()` (BullMQ default job handler)
- **Task Description**: Main entry point called by BullMQ when a job is dequeued from `email-processing-queue`. Orchestrates the full AI processing pipeline:
  1. Loads job payload (email log ID, raw body, pre-filter context, prompt hint).
  2. Updates `queue_jobs` record: sets `status = 'PROCESSING'`, increments `attempt_count`, persists `payload_snapshot`.
  3. Routes to AI classification pipeline based on job `priority` and `promptHint`:
     - **MoneyList jobs** (priority 2): Calls AI with specialized Banking Fluctuation prompt to extract transaction details.
     - **Whitelist jobs** (priority 1): Calls AI with elevated standard prompt for high-priority content analysis.
     - **Standard jobs** (priority 3): Calls AI with default general analysis prompt.
  4. Interprets AI classification result:
     - **Category 1 — Balance Fluctuation**: Calls `FinanceService.createTransaction()` to atomically update financial ledger. (Ref: `modules/finance/finance.service.md`)
     - **Category 2 — Schedules & Appointments**: Calls `CalendarService.createEvent()` to create and sync the event locally and to Google Calendar. (Ref: `modules/calendar/calendar.service.md`)
     - **Category 3 — General/Others**: Generates a concise highlight summary and stores it in `email_logs.ai_summary`.
     - **Emergency Alert**: Dispatches instant alert message via Telegram Bot API with quick-action inline buttons.
  5. On success: Updates `email_logs.status = 'PROCESSED'` and `queue_jobs.status = 'COMPLETED'`, records `completed_at` timestamp.
  6. On failure (after max retries exhausted): Updates `email_logs.status = 'FAILED'` (or keeps `PENDING` for manual retry), updates `queue_jobs.status = 'FAILED'`, persists `error_log`.
- **Accessed Tables**: `email_logs` (Read, Write), `queue_jobs` (Read, Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `job` (`Job<EmailProcessingJobPayload>`): BullMQ Job object containing:
    - `emailLogId` (`string`): UUID of the `email_logs` record to process.
    - `rawBody` (`string`): Email raw text/HTML body.
    - `sender` (`string`): Sender email address.
    - `subject` (`string`): Email subject line.
    - `promptHint` (`string`, optional): Context prompt override (e.g., `'BANKING_FLUCTUATION'`).
    - `priority` (`number`): Job priority level (1 = whitelist, 2 = moneylist, 3 = standard).

- **Output**:
  - `Promise<void>`: Resolves on successful processing. Throws on unrecoverable failure (triggers BullMQ retry/fail lifecycle).

---

### 2. onActive

- **Decorator**: `@OnQueueActive()`
- **Task Description**: BullMQ lifecycle hook triggered when a job transitions to `active` state. Logs job activation with job ID, email log ID, and attempt number for telemetry and observability.
- **Accessed Tables**: `queue_jobs` (Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `job` (`Job`): Active BullMQ job instance.

- **Output**:
  - `void`

---

### 3. onCompleted

- **Decorator**: `@OnQueueCompleted()`
- **Task Description**: BullMQ lifecycle hook triggered when a job completes successfully. Logs completion event and updates `queue_jobs.status = 'COMPLETED'` with `completed_at` timestamp.
- **Accessed Tables**: `queue_jobs` (Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `job` (`Job`): Completed BullMQ job instance.
  - `result` (`any`): Return value of the job handler.

- **Output**:
  - `void`

---

### 4. onFailed

- **Decorator**: `@OnQueueFailed()`
- **Task Description**: BullMQ lifecycle hook triggered when a job fails (after all retries exhausted). Updates `queue_jobs.status = 'FAILED'`, persists full `error_log` (stack trace + error message), and optionally triggers a Telegram alert for critical email processing failures.
- **Accessed Tables**: `queue_jobs` (Write), `email_logs` (Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `job` (`Job`): Failed BullMQ job instance.
  - `error` (`Error`): The error that caused the job failure.

- **Output**:
  - `void`

---

## Job Payload Type

```typescript
interface EmailProcessingJobPayload {
  emailLogId: string;       // UUID of the email_logs record
  rawBody: string;          // Raw email body content
  sender: string;           // Sender email address
  subject: string;          // Email subject line
  promptHint?: string;      // Optional AI prompt context hint (e.g., 'BANKING_FLUCTUATION')
  priority: 1 | 2 | 3;     // 1 = whitelist, 2 = moneylist, 3 = standard
}
```

---

## AI Classification Categories

| Category | Trigger Condition | Action |
| :--- | :--- | :--- |
| **Category 1 — Balance Fluctuation** | Bank/e-wallet transaction notification | Call `FinanceService.createTransaction()` |
| **Category 2 — Schedule/Appointment** | Meeting, appointment, or calendar event content | Call `CalendarService.createEvent()` |
| **Category 3 — General/Others** | Any other email content | Generate short highlight summary in `email_logs.ai_summary` |
| **Emergency Alert** | Urgent/high-priority flag from AI | Dispatch Telegram Bot API message with inline action buttons |
