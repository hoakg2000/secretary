# Email Module Service

- **General Description**: Handles business logic for Google OAuth authentication, Webhook ingestion processing, raw email log persistence, pushing email parsing jobs into BullMQ queue, and manages email filtering rules (`email_rules`).
- **Accessed Database Tables**:
  - `users`
  - `email_logs`
  - `email_rules`
  - `queue_jobs`

---

## List of Methods

### 1. getGoogleConnectUrl

- **Task Description**: Generates Google OAuth2 consent URL with necessary scopes for main inbox access.
- **Accessed Tables**: No DB access
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**: None

- **Output**:
  - `Promise<string>`: Generated Google OAuth redirect authorization URL.

---

### 2. handleGoogleCallback

- **Task Description**: Receives authorization code from Google OAuth callback, requests token pair, encrypts refresh and access tokens, and updates encrypted tokens in `users` table.
- **Accessed Tables**: `users` (Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `code` (`string`): OAuth authorization code returned by Google callback.

- **Output**:
  - `Promise<{ success: boolean; message: string }>`: Outcome status object of OAuth connection process.

---

### 3. processPubSubWebhook

- **Task Description**: Decodes incoming Pub/Sub webhooks, fetches email metadata via Gmail API, checks for duplicate hashes in `email_logs`, checks rules against `email_rules` (`blacklist`/`moneylist`/`whitelist`), creates record in `email_logs`, and enqueues job to BullMQ `queue_jobs`.
- **Accessed Tables**: `email_logs` (Read/Write), `email_rules` (Read), `queue_jobs` (Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `payload` (`GooglePubSubWebhookDto`): Raw Webhook push notification data payload from Pub/Sub.

- **Output**:
  - `Promise<{ success: boolean }>`: Webhook ACK confirmation response.

---

### 4. getEmailLogs

- **Task Description**: Queries ingested email log history with pagination and status filtering options.
- **Accessed Tables**: `email_logs` (Read)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `query` (`GetEmailLogsQueryDto`): DTO containing `page`, `limit`, and status filter options.

- **Output**:
  - `Promise<PaginatedEmailLogsResponseDto>`: Paginated list of `email_logs` entities with total record count.

---

### 5. reprocessEmailLog

- **Task Description**: Fetches `email_logs` record by ID, verifies existence, resets status to `PENDING`, creates a new entry in `queue_jobs`, and enqueues to BullMQ worker pipeline for re-analysis by AI.
- **Accessed Tables**: `email_logs` (Read/Write), `queue_jobs` (Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `id` (`string`): UUID of target email log entry.

- **Output**:
  - `Promise<{ jobId: string; status: string }>`: Created queue job reference and updated status.

---

### 6. getEmailRules

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

### 7. createEmailRule

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

### 8. updateEmailRule

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

### 9. deleteEmailRule

- **Task Description**: Verifies rule existence by ID and removes record from `email_rules` table.
- **Accessed Tables**: `email_rules` (Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `id` (`string`): UUID of rule to delete.

- **Output**:
  - `Promise<{ success: boolean; id: string }>`: Status of deletion operation.
