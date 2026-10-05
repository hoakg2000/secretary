# Email Module Controller

- **Base Endpoint**: `/api/v1/email`
- **General Description**: Handles Google OAuth connect & callback for main inbox, Pub/Sub webhook ingestion, email logs management, email reprocessing, and CRUD operations for email filtering rules (`email_rules`).

---

## List of Endpoints

### 1. Connect Google Account

- **Endpoint**: `GET /api/v1/email/google/connect`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Generates and returns the Google OAuth2 consent screen setup URL for authenticating the main inbox.

#### Data Transfer Objects (DTO)

- **Request DTO**: `None`

- **Response DTO**: `ConnectGoogleResponseDto`
  - `url` (`string`): Google OAuth2 consent URL.

---

### 2. Handle Google OAuth Callback

- **Endpoint**: `GET /api/v1/email/google/callback`
- **Guard / Auth**: `None`
- **Description**: Handles callback from Google OAuth2 server with Authorization Code, exchanges it for access & refresh tokens, encrypts the tokens, and updates user profile settings.

#### Data Transfer Objects (DTO)

- **Request DTO**: `GoogleOAuthCallbackQueryDto`
  - `code` (`string`, required): OAuth authorization code returned by Google.
  - `state` (`string`, optional): Security state token.

- **Response DTO**: `GoogleOAuthCallbackResponseDto`
  - `success` (`boolean`): OAuth linkage success status.
  - `message` (`string`): Outcome description message.

---

### 3. Handle Google Pub/Sub Webhook

- **Endpoint**: `POST /api/v1/email/webhooks/google-pubsub`
- **Guard / Auth**: `None`
- **Description**: Webhook endpoint called by Google Pub/Sub PUSH notifications when a new email arrives. Ingests raw data, deduplicates via message ID, applies rules, and pushes to processing queue if valid.

#### Data Transfer Objects (DTO)

- **Request DTO**: `GooglePubSubWebhookDto`
  - `message` (`object`, required): Google Pub/Sub message object containing data payload and messageId.
  - `subscription` (`string`, required): Google Pub/Sub subscription resource string.

- **Response DTO**: `WebhookAckResponseDto`
  - `success` (`boolean`): Acknowledgement status for Pub/Sub processor.

---

### 4. Get Email Ingestion Logs

- **Endpoint**: `GET /api/v1/email/logs`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Retrieves a paginated list of ingested emails from `email_logs` table with status filters.

#### Data Transfer Objects (DTO)

- **Request DTO**: `GetEmailLogsQueryDto`
  - `page` (`number`, optional, default: 1): Page number for pagination.
  - `limit` (`number`, optional, default: 10): Items per page limit.
  - `status` (`string`, optional, enum: `['PENDING', 'PROCESSED', 'SKIPPED']`): Filter logs by processing status.

- **Response DTO**: `PaginatedEmailLogsResponseDto`
  - `items` (`array`): Array of email log records.
  - `total` (`number`): Total count of records matching criteria.
  - `page` (`number`): Current page number.
  - `limit` (`number`): Items per page limit.

---

### 5. Reprocess Email Log

- **Endpoint**: `POST /api/v1/email/logs/:id/reprocess`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Manually pushes a specific email record back to BullMQ queue for re-analysis by the AI processing engine.

#### Data Transfer Objects (DTO)

- **Request DTO**: `EmailLogParamDto`
  - `id` (`string`, path param, UUID): Email log record ID.

- **Response DTO**: `ReprocessEmailResponseDto`
  - `jobId` (`string`): Created BullMQ queue job ID.
  - `status` (`string`): Updated status of the email log record.

---

### 6. Get Email Rules List

- **Endpoint**: `GET /api/v1/email/rules`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Retrieves all configured email filtering rules with optional filter by rule type.

#### Data Transfer Objects (DTO)

- **Request DTO**: `GetEmailRulesQueryDto`
  - `type` (`string`, optional, enum: `['blacklist', 'moneylist', 'whitelist']`): Filter by rule type.

- **Response DTO**: `EmailRulesListResponseDto`
  - `rules` (`array`): List of active/inactive rule objects from `email_rules`.

---

### 7. Create Email Filtering Rule

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

### 8. Update Email Filtering Rule

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

### 9. Delete Email Filtering Rule

- **Endpoint**: `DELETE /api/v1/email/rules/:id`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Deletes an email filter rule from `email_rules` table by ID.

#### Data Transfer Objects (DTO)

- **Request DTO**: `DeleteEmailRuleParamDto`
  - `id` (`string`, path param, UUID): Target rule ID to remove.

- **Response DTO**: `DeleteRuleResponseDto`
  - `success` (`boolean`): Success indicator.
  - `id` (`string`): ID of deleted rule.
