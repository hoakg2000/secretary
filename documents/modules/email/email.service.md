# Email Module Service

- **General Description**: Handles business logic for Webhook ingestion processing with token authorization, raw email log persistence, pushing email parsing jobs into BullMQ queue, and manages email filtering rules (`email_rules`).
- **Accessed Database Tables**:
  - `users`
  - `email_logs`
  - `email_rules`
  - `queue_jobs`

---

## List of Methods

### 1. processPubSubWebhook

- **Task Description**: Handles real-time email ingestion from Google Pub/Sub PUSH notifications:
  1. Validates the incoming Authorization Header/Token (Bearer token / subscription secret) against system configuration to ensure request integrity. Rejects unauthorized requests.
  2. Decodes base64 payload from Pub/Sub and retrieves full message details (Message-ID, Sender, Subject, Raw Body) from Gmail API using encrypted OAuth credentials stored in `users`.
  3. Computes SHA-256 deduplication hash: `deduplication_hash = SHA256(messageId + ":" + rawBody)` to guarantee strict idempotency.
  4. Checks `email_logs` for existing `deduplication_hash`:
     - If matched: Exits immediately with `{ success: true }`, ensuring zero duplicate transactions or calendar events upon worker/webhook retries.
  5. Evaluates pre-filtering rules against `email_rules` (`blacklist`, `moneylist`, `whitelist` with `sender`, `keyword`, `regex` matchers):
     - **Blacklist**: Persists to `email_logs` with status `SKIPPED`; completely skips BullMQ and AI processing.
     - **MoneyList**: Persists to `email_logs` with status `PENDING`; enqueues to BullMQ `email-processing-queue` with priority 2 and specialized Banking Fluctuation prompt context to extract balance changes. Creates initial record in `queue_jobs`.
     - **Whitelist**: Persists to `email_logs` with status `PENDING`; enqueues to BullMQ with priority 1 (High Priority Queue). Creates initial record in `queue_jobs`.
     - **Standard**: Persists to `email_logs` with status `PENDING`; enqueues to BullMQ with default priority 3. Creates initial record in `queue_jobs`.
  6. BullMQ Worker Processing Pipeline (Consumer):
     - Consumes job, logs payload snapshot and tracks retry attempts in `queue_jobs`.
     - Routes to AI pipeline for classification:
       - **Category 1 (Balance Fluctuation)**: Extracts transaction details and atomically updates financial ledger via `FinanceService`.
       - **Category 2 (Schedules & Appointments)**: Extracts appointment details and persists via `CalendarService` Proxy.
       - **Category 3 (General/Others)**: Generates concise highlights.
       - **Emergency Alerts**: Pushes instant alert to Telegram Bot API with quick-action buttons.
     - On successful execution, updates `email_logs.status = 'PROCESSED'` and marks job completed in `queue_jobs`.
- **Accessed Tables**: `email_logs` (Read/Write), `email_rules` (Read), `queue_jobs` (Write), `users` (Read)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `payload` (`GooglePubSubWebhookDto`): Raw Webhook push notification data payload from Pub/Sub.
  - `authorizationHeader` (`string`): Bearer token header string from incoming HTTP request.

- **Output**:
  - `Promise<{ success: boolean }>`: Webhook ACK confirmation response.

---

### 2. getEmailLogs

- **Task Description**: Queries ingested email log history with pagination, deduplication hash verification, and status filtering options.
- **Accessed Tables**: `email_logs` (Read)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `query` (`GetEmailLogsQueryDto`): DTO containing `page`, `limit`, and status filter options.

- **Output**:
  - `Promise<PaginatedEmailLogsResponseDto>`: Paginated list of `email_logs` entities with total record count.

---

### 3. reprocessEmailLog

- **Task Description**: Fetches `email_logs` record by ID, verifies existence, resets status to `PENDING`, inserts a new job tracking entry in `queue_jobs` (Job ID, retry count = 0, payload snapshot), and re-enqueues the email into BullMQ `email-processing-queue` for re-analysis by the AI processing engine.
- **Accessed Tables**: `email_logs` (Read/Write), `queue_jobs` (Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `id` (`string`): UUID of target email log entry.

- **Output**:
  - `Promise<{ jobId: string; status: string }>`: Created queue job reference and updated status (`PENDING`).

---

### 4. getEmailRules

- **Task Description**: Retrieves configured email filter rules list, filtered by optional rule type (`blacklist`, `moneylist`, `whitelist`).
- **Accessed Tables**: `email_rules` (Read)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `type` (`string`, optional): Rule type filter (`blacklist` | `moneylist` | `whitelist`).

- **Output**:
  - `Promise<EmailRule[]>`: Array of email filter rule entities.

---

### 5. createEmailRule

- **Task Description**: Validates inputs (match pattern syntax according to matcher strategy) and creates a new email rule record in `email_rules`.
- **Accessed Tables**: `email_rules` (Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `dto` (`CreateEmailRuleDto`): DTO containing `type`, `matcher`, `matchValue`, `description`, and `isActive`.

- **Output**:
  - `Promise<EmailRule>`: Newly created rule record.

---

### 6. updateEmailRule

- **Task Description**: Validates existing record in `email_rules`, updates provided attributes (`type`, `matcher`, `matchValue`, `description`, `isActive`), and saves changes.
- **Accessed Tables**: `email_rules` (Read/Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `id` (`string`): UUID of rule to update.
  - `dto` (`UpdateEmailRuleDto`): DTO containing updated rule attributes.

- **Output**:
  - `Promise<EmailRule>`: Updated rule entity.

---

### 7. deleteEmailRule

- **Task Description**: Verifies rule existence by ID and removes record from `email_rules` table.
- **Accessed Tables**: `email_rules` (Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `id` (`string`): UUID of rule to delete.

- **Output**:
  - `Promise<{ success: boolean; id: string }>`: Status of deletion operation.
