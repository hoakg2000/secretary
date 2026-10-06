# Documentation: API Modules

## 1. Auth Module

### Controller (`docs/modules/auth/auth.controller.md`)

#### Endpoints

- **`POST /api/v1/auth/login`**: `login`
  - **Purpose**: Master User login using credentials to issue Access Token and set HTTP-Only Refresh Cookie.
- **`POST /api/v1/auth/refresh`**: `refreshToken`
  - **Purpose**: Validate encrypted Refresh Token and issue a new Access Token.
- **`POST /api/v1/auth/logout`**: `logout`
  - **Purpose**: Revoke active Refresh Token and terminate user login session in `user_sessions`.
- **`GET /api/v1/auth/session`**: `getAppSession`
  - **Purpose**: Retrieve current active session details, device info, and user status.

### Service (`docs/modules/auth/auth.service.md`)

#### Methods

- **`login`**: Authenticates Master User credentials, generates JWT tokens, creates session record in `user_sessions`, and sets HTTP-Only Refresh Token cookie.
- **`refreshToken`**: Validates encrypted Refresh Token, checks token status in `refresh_tokens`, and issues a new Access Token.
- **`logout`**: Revokes active Refresh Token in `refresh_tokens` and terminates active user session in `user_sessions`.
- **`getAppSession`**: Fetches active session state, client metadata, and Master User status from `user_sessions`.

---

## 2. Character Module

### Controller: `CharacterPersonaController` (`docs/modules/character/character.controller.md`)

#### Endpoints

- **`GET /api/v1/characters`**: `getCharacters`
  - **Purpose**: Get the list of all AI characters.
- **`POST /api/v1/characters`**: `createCharacter`
  - **Purpose**: Create a new AI character (inputs: Name, Voice ID, Source).
- **`PUT /api/v1/characters/:id`**: `updateCharacter`
  - **Purpose**: Update character information (Name, Voice ID, Source, Active status).
- **`DELETE /api/v1/characters/:id`**: `deleteCharacter`
  - **Purpose**: Delete a character.
- **`GET /api/v1/characters/:id/personas`**: `getPersonasByCharacterId`
  - **Purpose**: Get all Persona configurations (`SYSTEM_PROMPT`, `TONE`, `IDENTITY`, `KNOWLEDGE_BACKGROUND`, `RELATIONSHIP_DYNAMICS`, `OTHER`) for a specific character.
- **`POST /api/v1/characters/:id/personas`**: `addPersona`
  - **Purpose**: Add a new Persona attribute configuration for a character (`type` + `value`).
- **`PUT /api/v1/characters/:id/personas/:personaId`**: `updatePersona`
  - **Purpose**: Edit a specific Persona attribute configuration.
- **`DELETE /api/v1/characters/:id/personas/:personaId`**: `deletePersona`
  - **Purpose**: Delete a Persona attribute.

### Service: `CharacterPersonaService` (`docs/modules/character/character.service.md`)

#### Methods

- **`getCharacters`**: Retrieves all existing AI character records from the database.
- **`createCharacter`**: Creates a new AI character entry and manages single active character state logic.
- **`updateCharacter`**: Updates AI character details (Name, Voice ID, Source, Active status) by ID.
- **`deleteCharacter`**: Removes a character entry and cascades deletion to associated personas.
- **`getPersonasByCharacterId`**: Fetches all persona attribute configurations assigned to a given character.
- **`addPersona`**: Adds a new persona attribute (`type` enum: `SYSTEM_PROMPT`, `TONE`, `IDENTITY`, `KNOWLEDGE_BACKGROUND`, `RELATIONSHIP_DYNAMICS`, `OTHER` and `value`) to a character.
- **`updatePersona`**: Updates an existing persona attribute's type or value after validating character ownership.
- **`deletePersona`**: Removes a specific persona attribute from a character after validating ownership.

---

## 3. Email Module

### Controller (`docs/modules/email/email.controller.md`)

#### Endpoints

- **`GET /api/v1/email/google/connect`**: `getGoogleConnectUrl`
  - **Purpose**: Generates and returns the Google OAuth2 authorization URL for connecting the main inbox.
- **`GET /api/v1/email/google/callback`**: `handleGoogleCallback`
  - **Purpose**: Receives Google OAuth authorization code, exchanges it for access/refresh tokens, encrypts them, and updates user profile settings.
- **`POST /api/v1/email/webhooks/google-pubsub`**: `processPubSubWebhook`
  - **Purpose**: Ingests Google Pub/Sub PUSH notifications for incoming emails, deduplicates using SHA-256 hash (`Message-ID` + Raw Body), applies filtering rules (`blacklist`, `moneylist`, `whitelist`), and enqueues valid messages into BullMQ for AI processing.
- **`GET /api/v1/email/logs`**: `getEmailLogs`
  - **Purpose**: Retrieves a paginated list of ingested email records from `email_logs` table with status and deduplication hash metadata.
- **`POST /api/v1/email/logs/:id/reprocess`**: `reprocessEmailLog`
  - **Purpose**: Manually re-queues an email log record into BullMQ worker queue for AI processing and tracks in `queue_jobs`.
- **`GET /api/v1/email/rules`**: `getEmailRules`
  - **Purpose**: Retrieves email filtering rules from `email_rules` table, optionally filtered by rule type (`blacklist`, `moneylist`, `whitelist`).
- **`POST /api/v1/email/rules`**: `createEmailRule`
  - **Purpose**: Creates a new email filtering rule (`blacklist`, `moneylist`, or `whitelist` with `sender`, `keyword`, `regex` matchers).
- **`PUT /api/v1/email/rules/:id`**: `updateEmailRule`
  - **Purpose**: Updates configuration for an existing email filtering rule by ID.
- **`DELETE /api/v1/email/rules/:id`**: `deleteEmailRule`
  - **Purpose**: Deletes an email filtering rule by ID.

### Service (`docs/modules/email/email.service.md`)

#### Methods

- **`getGoogleConnectUrl`**: Generates the Google OAuth2 consent screen redirect URL with required scopes.
- **`handleGoogleCallback`**: Handles OAuth callback, exchanges authorization code for tokens, encrypts token data, and persists encrypted tokens to `users` table.
- **`processPubSubWebhook`**: Decodes incoming Pub/Sub webhook payloads, queries Gmail API for raw email data, verifies SHA-256 deduplication hash (`Message-ID` + Raw Body), applies email rules from `email_rules`, persists records to `email_logs`, and asynchronously enqueues jobs into BullMQ with priority routing (`queue_jobs` tracking).
- **`getEmailLogs`**: Fetches paginated email ingestion history from `email_logs` table according to pagination and status filters.
- **`reprocessEmailLog`**: Resets email status to `PENDING` in `email_logs`, logs job in `queue_jobs`, and re-pushes the email log ID into the BullMQ queue for AI processing.
- **`getEmailRules`**: Retrieves email filtering rules from `email_rules` table with optional filter by rule type (`blacklist`, `moneylist`, `whitelist`).
- **`createEmailRule`**: Validates pattern/matcher inputs and inserts a new rule into `email_rules` table.
- **`updateEmailRule`**: Validates existing record and updates rule attributes in `email_rules` table.
- **`deleteEmailRule`**: Verifies existence and deletes a rule record from `email_rules` table.

---

## 4. Finance Module

### Controller (`docs/modules/finance/finance.controller.md`)

#### Endpoints

- **`GET /api/v1/finance/accounts`**: `getAccounts`
  - **Purpose**: Retrieve top-level **Total Account** aggregate balance and individual bank accounts/e-wallets with cached balances for drill-down.
- **`POST /api/v1/finance/accounts`**: `createAccount`
  - **Purpose**: Add new bank account / e-wallet.
- **`PUT /api/v1/finance/accounts/:id`**: `updateAccount`
  - **Purpose**: Edit account name, bank code, currency type.
- **`PATCH /api/v1/finance/accounts/:id/balance`**: `adjustBalance`
  - **Purpose**: Directly adjust base balance (Manual Balance Adjustment).
- **`GET /api/v1/finance/transactions`**: `getTransactions`
  - **Purpose**: Get income/expense transaction history (Paginated, Filter by time, account type, category).
- **`POST /api/v1/finance/transactions`**: `createTransaction`
  - **Purpose**: Add a manual transaction (Atomically updates available balance within ACID database transaction).
- **`PUT /api/v1/finance/transactions/:id`**: `updateTransaction`
  - **Purpose**: Edit transaction details and calculate/apply atomic balance delta adjustment.
- **`DELETE /api/v1/finance/transactions/:id`**: `deleteTransaction`
  - **Purpose**: Delete transaction and execute complete atomic balance reversal.
- **`GET /api/v1/finance/summary`**: `getFinanceSummary`
  - **Purpose**: Overview report of financial fluctuations (Total income, total expenses, chart analysis by cash flow/category) by Daily / Weekly / Monthly / Yearly cycles.

### Service (`docs/modules/finance/finance.service.md`)

#### Methods

- **`getAccounts`**: Fetches active bank accounts/e-wallets and calculates top-level **Total Account** aggregate balance.
- **`createAccount`**: Creates a new bank account or e-wallet record in `bank_accounts`.
- **`updateAccount`**: Updates bank account details by ID.
- **`adjustBalance`**: Directly updates cached balance of a bank account in `bank_accounts`.
- **`getTransactions`**: Retrieves paginated income/expense transactions from `transactions` with criteria filters.
- **`createTransaction`**: Inserts a transaction and atomically updates cached balance (`+amount` for `INCOME`, `-amount` for `EXPENSE`).
- **`updateTransaction`**: Updates transaction details and adjusts balance delta atomically.
- **`deleteTransaction`**: Deletes a transaction and performs atomic balance reversal.
- **`getFinanceSummary`**: Aggregates income, expenses, and cash flow charts by time cycles (Exposed as AI Tool `get_finance_summary`).

---

## 5. Calendar Module

### Controller (`docs/modules/calendar/calendar.controller.md`)

#### Endpoints

- **`GET /api/v1/calendar/events`**: `getEvents`
  - **Purpose**: Retrieve local DB calendar events with `calendar_sync_states` (`SYNCED`, `DIRTY`, `CONFLICT`).
- **`POST /api/v1/calendar/events`**: `createEvent`
  - **Purpose**: Create a new calendar event in local database and trigger sync to Google Calendar.
- **`PUT /api/v1/calendar/events/:id`**: `updateEvent`
  - **Purpose**: Edit an event, transition sync state to `DIRTY`, and push updates to Google Calendar.
- **`DELETE /api/v1/calendar/events/:id`**: `deleteEvent`
  - **Purpose**: Delete an event locally and remove/cancel from Google Calendar.
- **`POST /api/v1/calendar/sync`**: `syncGoogleCalendar`
  - **Purpose**: Trigger manual bi-directional sync between Local Calendar and Google Calendar API using ETag and sync states (`SYNCED`, `DIRTY`, `CONFLICT`).

### Service (`docs/modules/calendar/calendar.service.md`)

#### Methods

- **`getEvents`**: Retrieves local DB calendar events within date ranges from `local_calendars` (Exposed as AI Tool `get_calendar_events`).
- **`createEvent`**: Inserts a new calendar event and syncs to Google Calendar (Exposed as AI Tool `create_calendar_event`).
- **`updateEvent`**: Edits a local calendar event and manages `calendar_sync_states` transitions (`DIRTY` -> `SYNCED` or `CONFLICT`).
- **`deleteEvent`**: Deletes a calendar event locally and cancels Google Calendar event.
- **`syncGoogleCalendar`**: Performs manual bi-directional synchronization between Local DB and Google Calendar API using `calendar_sync_states` with ETag validation.

---

## 6. AI Module

### Controller (`docs/modules/ai/ai.controller.md`)

#### Endpoints

- **`POST /api/v1/ai/chat/stream`**: `streamChat`
  - **Purpose**: Interactive streaming chat endpoint (Server-Sent Events / SSE) with AI tool calling execution.
- **`POST /api/v1/ai/tts/stream`**: `streamTts`
  - **Purpose**: Text-to-Speech audio streaming endpoint via Fish.audio.
- **`GET /api/v1/ai/memories`**: `searchMemories`
  - **Purpose**: Hybrid search and listing for AI memories combining Vector Cosine Distance ($1536/3072$ dimensions) and Full-Text Search `tsvector`, weighted by decay formula $S(t) = S_0 \cdot e^{-\lambda t}$.
- **`POST /api/v1/ai/memories`**: `createMemory`
  - **Purpose**: Manually create AI memory with automatic vector embedding generation ($1536/3072$ dimensions) and `content_tsv`.
- **`PUT /api/v1/ai/memories/:id`**: `updateMemory`
  - **Purpose**: Update memory text, recalculate vector embedding and `content_tsv`, and update decay factor.
- **`DELETE /api/v1/ai/memories/:id`**: `deleteMemory`
  - **Purpose**: Delete or disable AI memory record from `ai_memories`.
- **`POST /api/v1/ai/proactive/trigger`**: `triggerProactiveOrchestrator`
  - **Purpose**: Trigger Proactive Orchestrator for proactive push/Telegram notifications.

### Service (`docs/modules/ai/ai.service.md`)

#### Registered AI Tools Catalog
- **`get_finance_summary`** (`FinanceService`)
- **`get_calendar_events`** (`CalendarService`)
- **`create_calendar_event`** (`CalendarService`)
- **`search_ai_memories`** (`AiService`)
- **`create_ai_memory`** (`AiService`)

#### Methods

- **`streamChat`**: Handles chat execution with active Character/Persona context, RAG memory retrieval, registered AI tools execution loop, and SSE streaming.
- **`streamTts`**: Generates audio stream payload via Fish.audio API integration based on active Character's `voice_id`.
- **`searchMemories`**: Executes Hybrid Search in `ai_memories` (Vector Cosine Distance $1536/3072$ dimensions + `tsvector`) with Memory Decay formula $S(t) = S_0 \cdot e^{-\lambda t}$ (Exposed as AI Tool `search_ai_memories`).
- **`createMemory`**: Stores new memory, generates $1536/3072$ dimensions embedding, and builds `content_tsv` (Exposed as AI Tool `create_ai_memory`).
- **`updateMemory`**: Updates memory content, vector embedding, and decay parameters in `ai_memories`.
- **`deleteMemory`**: Removes or disables memory record from `ai_memories`.
- **`triggerProactiveOrchestrator`**: Evaluates context and initiates proactive engagement messages via Telegram/Push Notification.
- **`processMemoryDecayJob`**: Background cron calculating memory decay score $S(t) = S_0 \cdot e^{-\lambda t}$, persisting logs in `memory_decay_logs`, and pruning obsolete memories.

