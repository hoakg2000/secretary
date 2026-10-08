# Email Module Controller

- **Base Endpoint**: `/api/v1/email`
- **General Description**: Handles Pub/Sub webhook ingestion with token authorization, email logs management, email reprocessing, and CRUD operations for email filtering rules (`email_rules`).

> **Note**: Google OAuth2 Connect & Callback endpoints (`GET /api/v1/auth/google/connect`, `GET /api/v1/auth/google/callback`) are owned exclusively by **Auth Module** (Ref: `auth/auth.controller.md`). Email Module only receives webhook PUSH notifications from Google Pub/Sub after OAuth connection is established.

---

## List of Endpoints

### 1. Handle Google Pub/Sub Webhook

- **Endpoint**: `POST /api/v1/email/webhooks/google-pubsub`
- **Guard / Auth**: `PubSubAuthGuard` (Validates `Authorization: Bearer <token>` / Webhook verification secret configured in Google Cloud Pub/Sub push subscription)
- **Description**: Webhook endpoint triggered by Google Pub/Sub PUSH notifications when a new email arrives in the primary connected inbox. Enforces Authorization token validation to ensure authenticity from Google Cloud. The service fetches raw email content from Gmail API, computes a deduplication hash (`SHA-256` of `Message-ID` + Raw Body) to enforce idempotency, evaluates pre-filtering rules in `email_rules` (`blacklist`, `moneylist`, `whitelist`), persists the record into `email_logs`, and asynchronously enqueues the job to BullMQ (`queue_jobs`) for worker processing:
  - **Authorization Verification**: Validates the Bearer token in the `Authorization` header against the system's Pub/Sub secret. Returns 401 Unauthorized if invalid or missing.
  - **Deduplication Check**: If the hash already exists in `email_logs`, immediately returns ACK and skips processing to prevent duplicate financial or calendar entries.
  - **Blacklist**: Email is marked as `SKIPPED` in `email_logs` and completely bypasses the AI pipeline.
  - **MoneyList**: Routed with high priority to BullMQ accompanied by a specialized Banking Fluctuation prompt payload.
  - **Whitelist**: Enqueued with elevated priority in BullMQ for fast-track processing.
  - **Normal**: Enqueued to the standard BullMQ processing queue.

#### Data Transfer Objects (DTO)

- **Request DTO**: `GooglePubSubWebhookDto`
  - `message` (`object`, required): Google Pub/Sub message object containing base64 data payload, messageId, and publishTime.
  - `subscription` (`string`, required): Google Pub/Sub subscription resource string.
  - `authorization` (`string`, header, required): Bearer token / Shared secret for webhook verification.

- **Response DTO**: `WebhookAckResponseDto`
  - `success` (`boolean`): Acknowledgement status for Pub/Sub processor.

---

### 2. Get Email Ingestion Logs

- **Endpoint**: `GET /api/v1/email/logs`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Retrieves a paginated list of ingested emails from `email_logs` table with status filters and deduplication metadata.

#### Data Transfer Objects (DTO)

- **Request DTO**: `GetEmailLogsQueryDto`
  - `page` (`number`, optional, default: 1): Page number for pagination.
  - `limit` (`number`, optional, default: 10): Items per page limit.
  - `status` (`string`, optional, enum: `['PENDING', 'PROCESSED', 'SKIPPED']`): Filter logs by processing status.

- **Response DTO**: `PaginatedEmailLogsResponseDto`
  - `items` (`EmailLogResponseDto[]`): Array of email log records:
    - `id` (`string`): UUID of the email log record.
    - `messageId` (`string`): Email header Message-ID.
    - `sender` (`string`): Sender email address.
    - `subject` (`string`): Subject line.
    - `rawBody` (`string`): Raw text/HTML body.
    - `deduplicationHash` (`string`): SHA-256 hash of `Message-ID` + Raw Body.
    - `status` (`string`, enum: `['PENDING', 'PROCESSED', 'SKIPPED']`): Ingestion/processing status.
    - `createdAt` (`string`): Ingestion timestamp.
  - `total` (`number`): Total count of records matching criteria.
  - `page` (`number`): Current page number.
  - `limit` (`number`): Items per page limit.

---

### 3. Reprocess Email Log

- **Endpoint**: `POST /api/v1/email/logs/:id/reprocess`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Manually re-queues an existing email record from `email_logs` into BullMQ worker queue for re-analysis by the AI processing engine. Resets email status to `PENDING` and tracks execution status in `queue_jobs`.

#### Data Transfer Objects (DTO)

- **Request DTO**: `EmailLogParamDto`
  - `id` (`string`, path param, UUID): Email log record ID.

- **Response DTO**: `ReprocessEmailResponseDto`
  - `jobId` (`string`): Created BullMQ queue job ID in `queue_jobs`.
  - `status` (`string`): Updated status of the email log record (`PENDING`).

---

### 4. Get Email Rules List

- **Endpoint**: `GET /api/v1/email/rules`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Retrieves all configured email filtering rules with optional filter by rule type.

#### Data Transfer Objects (DTO)

- **Request DTO**: `GetEmailRulesQueryDto`
  - `type` (`string`, optional, enum: `['blacklist', 'moneylist', 'whitelist']`): Filter by rule type.

- **Response DTO**: `EmailRulesListResponseDto`
  - `rules` (`array`): List of active/inactive rule objects from `email_rules`.

---

### 5. Create Email Filtering Rule

- **Endpoint**: `POST /api/v1/email/rules`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Creates a new rule in `email_rules` for filtering incoming emails (`blacklist`, `moneylist`, or `whitelist`).

#### Data Transfer Objects (DTO)

- **Request DTO**: `CreateEmailRuleDto`
  - `type` (`string`, required, enum: `['blacklist', 'moneylist', 'whitelist']`): Type of email rule.
  - `matcher` (`string`, required, enum: `['sender', 'keyword', 'regex']`): Matching strategy.
  - `matchValue` (`string`, required): Specific string/pattern value to match against incoming emails.
  - `description` (`string`, optional): Optional note describing the rule.
  - `isActive` (`boolean`, optional, default: true): Rule status flag.

- **Response DTO**: `EmailRuleResponseDto`
  - `id` (`string`): Created rule UUID.
  - `type` (`string`): Rule type.
  - `matcher` (`string`): Matcher strategy.
  - `matchValue` (`string`): Configured pattern.
  - `description` (`string`): Description notes.
  - `isActive` (`boolean`): Enable state.
  - `createdAt` (`string`): Timestamp of creation.

---

### 6. Update Email Filtering Rule

- **Endpoint**: `PUT /api/v1/email/rules/:id`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Updates configuration for an existing email filtering rule by ID.

#### Data Transfer Objects (DTO)

- **Request DTO**: `UpdateEmailRuleDto`
  - `id` (`string`, path param, UUID): Target rule ID.
  - `type` (`string`, optional, enum: `['blacklist', 'moneylist', 'whitelist']`): Updated rule type.
  - `matcher` (`string`, optional, enum: `['sender', 'keyword', 'regex']`): Updated matcher strategy.
  - `matchValue` (`string`, optional): Updated match pattern string.
  - `description` (`string`, optional): Updated description text.
  - `isActive` (`boolean`, optional): Toggle enable status.

- **Response DTO**: `EmailRuleResponseDto`
  - `id` (`string`): Updated rule ID.
  - `type` (`string`): Updated rule type.
  - `matcher` (`string`): Matcher type.
  - `matchValue` (`string`): Updated match pattern.
  - `description` (`string`): Description text.
  - `isActive` (`boolean`): Active state.
  - `updatedAt` (`string`): Timestamp of update.

---

### 7. Delete Email Filtering Rule

- **Endpoint**: `DELETE /api/v1/email/rules/:id`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Deletes an email filter rule from `email_rules` table by ID.

#### Data Transfer Objects (DTO)

- **Request DTO**: `DeleteEmailRuleParamDto`
  - `id` (`string`, path param, UUID): Target rule ID to remove.

- **Response DTO**: `DeleteRuleResponseDto`
  - `success` (`boolean`): Success indicator.
  - `id` (`string`): ID of deleted rule.
