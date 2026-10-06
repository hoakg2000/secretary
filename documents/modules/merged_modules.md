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
  - **Purpose**: Get all Persona configurations (Prompt, Tone, Identity, etc.) for a specific character.
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
- **`addPersona`**: Adds a new persona attribute (`type` and `value`) to a character.
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
  - **Purpose**: Ingests Google Pub/Sub PUSH notifications for incoming emails, deduplicates using message IDs, checks filtering rules, and enqueues valid messages for AI processing.
- **`GET /api/v1/email/logs`**: `getEmailLogs`
  - **Purpose**: Retrieves a paginated list of ingested email records from `email_logs` table with optional processing status filters.
- **`POST /api/v1/email/logs/:id/reprocess`**: `reprocessEmailLog`
  - **Purpose**: Manually re-queues an email log record into BullMQ for AI processing.
- **`GET /api/v1/email/rules`**: `getEmailRules`
  - **Purpose**: Retrieves email filtering rules from `email_rules` table, optionally filtered by rule type (`blacklist`, `moneylist`, `whitelist`).
- **`POST /api/v1/email/rules`**: `createEmailRule`
  - **Purpose**: Creates a new email filtering rule (`blacklist`, `moneylist`, or `whitelist`).
- **`PUT /api/v1/email/rules/:id`**: `updateEmailRule`
  - **Purpose**: Updates configuration for an existing email filtering rule by ID.
- **`DELETE /api/v1/email/rules/:id`**: `deleteEmailRule`
  - **Purpose**: Deletes an email filtering rule by ID.

### Service (`docs/modules/email/email.service.md`)

#### Methods

- **`getGoogleConnectUrl`**: Generates the Google OAuth2 consent screen redirect URL with required scopes.
- **`handleGoogleCallback`**: Handles OAuth callback, exchanges authorization code for tokens, encrypts token data, and persists encrypted tokens to `users` table.
- **`processPubSubWebhook`**: Decodes incoming Pub/Sub webhook payloads, queries Gmail API for raw email data, verifies duplication, applies email rules from `email_rules`, persists records to `email_logs`, and enqueues jobs into `queue_jobs` for BullMQ processing.
- **`getEmailLogs`**: Fetches paginated email ingestion history from `email_logs` table according to pagination and status filters.
- **`reprocessEmailLog`**: Resets email status to `PENDING` in `email_logs`, creates a job in `queue_jobs`, and re-pushes the email log ID into the BullMQ queue for AI processing.
- **`getEmailRules`**: Retrieves email filtering rules from `email_rules` table with optional filter by rule type (`blacklist`, `moneylist`, `whitelist`).
- **`createEmailRule`**: Validates pattern/matcher inputs and inserts a new rule into `email_rules` table.
- **`updateEmailRule`**: Validates existing record and updates rule attributes in `email_rules` table.
- **`deleteEmailRule`**: Verifies existence and deletes a rule record from `email_rules` table.

---

## 4. Finance Module

### Controller (`docs/modules/finance/finance.controller.md`)

#### Endpoints

- **`GET /api/v1/finance/accounts`**: `getAccounts`
  - **Purpose**: Retrieve list of bank accounts/e-wallets along with balances and total aggregate balance.
- **`POST /api/v1/finance/accounts`**: `createAccount`
  - **Purpose**: Add new bank account / e-wallet.
- **`PUT /api/v1/finance/accounts/:id`**: `updateAccount`
  - **Purpose**: Edit account name, bank code, currency type.
- **`PATCH /api/v1/finance/accounts/:id/balance`**: `adjustBalance`
  - **Purpose**: Directly adjust base balance (Manual Balance Adjustment).
- **`GET /api/v1/finance/transactions`**: `getTransactions`
  - **Purpose**: Get income/expense transaction history (Paginated, Filter by time, account type, category).
- **`POST /api/v1/finance/transactions`**: `createTransaction`
  - **Purpose**: Add a manual transaction (Automatically updates available balance atomically).
- **`PUT /api/v1/finance/transactions/:id`**: `updateTransaction`
  - **Purpose**: Edit transaction details (Amount, note, category, time) and calculate automatic balance adjustment.
- **`DELETE /api/v1/finance/transactions/:id`**: `deleteTransaction`
  - **Purpose**: Delete transaction and complete balance reversal (Revert balance effect).
- **`GET /api/v1/finance/summary`**: `getFinanceSummary`
  - **Purpose**: Overview report of financial fluctuations (Total income, total expenses, chart analysis by cash flow/category) by Daily / Weekly / Monthly / Yearly cycles.

### Service (`docs/modules/finance/finance.service.md`)

#### Methods

- **`getAccounts`**: Fetches active bank accounts/e-wallets and calculates total aggregate balance.
- **`createAccount`**: Creates a new bank account or e-wallet record in `bank_accounts`.
- **`updateAccount`**: Updates bank account details by ID.
- **`adjustBalance`**: Directly updates cached balance of a bank account in `bank_accounts`.
- **`getTransactions`**: Retrieves paginated income/expense transactions from `transactions` with criteria filters.
- **`createTransaction`**: Inserts a transaction and atomically updates cached balance.
- **`updateTransaction`**: Updates transaction details and adjusts balance delta atomically.
- **`deleteTransaction`**: Deletes a transaction and performs balance reversal atomically.
- **`getFinanceSummary`**: Aggregates income, expenses, and cash flow charts by time cycles (Exposed as AI Tool `get_finance_summary`).

---

## 5. Calendar Module

### Controller (`docs/modules/calendar/calendar.controller.md`)

#### Endpoints

- **`GET /api/v1/calendar/events`**: `getEvents`
  - **Purpose**: Retrieve local DB calendar events.
- **`POST /api/v1/calendar/events`**: `createEvent`
  - **Purpose**: Create a new calendar event and sync to Google Calendar.
- **`PUT /api/v1/calendar/events/:id`**: `updateEvent`
  - **Purpose**: Edit an event.
- **`DELETE /api/v1/calendar/events/:id`**: `deleteEvent`
  - **Purpose**: Delete an event.
- **`POST /api/v1/calendar/sync`**: `syncGoogleCalendar`
  - **Purpose**: Trigger manual sync between Local Calendar and Google Calendar API.

### Service (`docs/modules/calendar/calendar.service.md`)

#### Methods

- **`getEvents`**: Retrieves local DB calendar events within date ranges from `local_calendars` (Exposed as AI Tool `get_calendar_events`).
- **`createEvent`**: Inserts a new calendar event and syncs to Google Calendar (Exposed as AI Tool `create_calendar_event`).
- **`updateEvent`**: Edits a local calendar event and flags dirty sync status in `calendar_sync_states`.
- **`deleteEvent`**: Deletes a calendar event and cancels Google Calendar event.
- **`syncGoogleCalendar`**: Performs manual bi-directional synchronization between Local DB and Google Calendar API using `calendar_sync_states`.

---

## 6. AI Module

### Controller (`docs/modules/ai/ai.controller.md`)

#### Endpoints

- **`POST /api/v1/ai/chat/stream`**: `streamChat`
  - **Purpose**: Interactive streaming chat endpoint (Server-Sent Events / SSE).
- **`POST /api/v1/ai/tts/stream`**: `streamTts`
  - **Purpose**: Text-to-Speech audio streaming endpoint via Fish.audio.
- **`GET /api/v1/ai/memories`**: `searchMemories`
  - **Purpose**: Hybrid search and listing for AI memories (`pgvector` + `tsvector`).
- **`POST /api/v1/ai/memories`**: `createMemory`
  - **Purpose**: Manually create AI memory with automatic vector embedding generation.
- **`PUT /api/v1/ai/memories/:id`**: `updateMemory`
  - **Purpose**: Update memory text, re-generate embedding, and update decay factor.
- **`DELETE /api/v1/ai/memories/:id`**: `deleteMemory`
  - **Purpose**: Delete or disable AI memory record.
- **`POST /api/v1/ai/proactive/trigger`**: `triggerProactiveOrchestrator`
  - **Purpose**: Trigger Proactive Orchestrator for proactive push/Telegram notifications.

### Service (`docs/modules/ai/ai.service.md`)

#### Methods

- **`streamChat`**: Handles chat execution with RAG memory retrieval and SSE streaming.
- **`streamTts`**: Generates audio stream payload via Fish.audio API integration based on active Character's `voice_id`.
- **`searchMemories`**: Executes vector similarity and keyword hybrid search in `ai_memories` (Exposed as AI Tool `search_ai_memories`).
- **`createMemory`**: Stores new memory and generates `pgvector` embedding in `ai_memories` (Exposed as AI Tool `create_ai_memory`).
- **`updateMemory`**: Updates memory content, vector embedding, and decay parameters in `ai_memories`.
- **`deleteMemory`**: Removes or disables memory record from `ai_memories`.
- **`triggerProactiveOrchestrator`**: Evaluates context and initiates proactive engagement messages via Telegram/Push Notification.
# AI Agent & Semantic Memory Controller

- **Base Endpoint**: `/api/v1/ai`
- **General Description**: Controller handling interactive AI streaming chat, streaming Text-to-Speech (TTS), full CRUD and hybrid search management for AI semantic memories, and manual trigger for the proactive AI orchestrator.

---

## List of Endpoints

### 1. Interactive Streaming Chat

- **Endpoint**: `POST /api/v1/ai/chat/stream`
- **Guard / Auth**: `AuthGuard('jwt')`[cite: 1]
- **Description**: Handles real-time interactive chat with the active AI Agent, streaming response chunks back to the client using Server-Sent Events (SSE).

#### Data Transfer Objects (DTO)

- **Request DTO**: `StreamChatDto`
  - `message` (`string`, required): User chat message input.
  - `characterId` (`string`, optional): Optional specific character ID override; defaults to active character.
  - `sessionId` (`string`, optional): Session identifier to maintain conversation state.

- **Response DTO**: `Observable<MessageEvent>` (Server-Sent Events)
  - `data` (`string`): Streaming text token chunk or JSON metadata frame.

---

### 2. Streaming Text-to-Speech (TTS)

- **Endpoint**: `POST /api/v1/ai/tts/stream`
- **Guard / Auth**: `AuthGuard('jwt')`[cite: 1]
- **Description**: Receives text input and returns an audio stream from Fish.audio API corresponding to the active character's `voice_id`.

#### Data Transfer Objects (DTO)

- **Request DTO**: `StreamTtsDto`
  - `text` (`string`, required): Text payload to synthesize into audio stream.
  - `voiceId` (`string`, optional): Override voice identifier; defaults to current character's `voice_id`.

- **Response DTO**: `StreamableFile` / Audio Stream
  - `contentType` (`string`): Audio MIME type (e.g., `audio/mpeg`).

---

### 3. Query & Hybrid Search AI Memories

- **Endpoint**: `GET /api/v1/ai/memories`
- **Guard / Auth**: `AuthGuard('jwt')`[cite: 1]
- **Description**: Searches and lists stored AI memories using hybrid search (Vector Cosine similarity combined with PostgreSQL Full-Text Search `tsvector`).

#### Data Transfer Objects (DTO)

- **Request DTO**: `QueryMemoryDto`
  - `query` (`string`, optional): Text query for hybrid search matching.
  - `category` (`string`, optional): Filter memory by category tag.
  - `source` (`string`, optional, enum: `['CHAT', 'EMAIL', 'MANUAL']`): Filter by memory origin.
  - `limit` (`number`, optional): Maximum number of results to return (default: 20).

- **Response DTO**: `MemoryListResponseDto`
  - `items` (`Array<MemoryResponseDto>`): Array of matching AI memory records with decay scores.
  - `total` (`number`): Total records matching search criteria.

---

### 4. Manually Add AI Memory

- **Endpoint**: `POST /api/v1/ai/memories`
- **Guard / Auth**: `AuthGuard('jwt')`[cite: 1]
- **Description**: Adds a new memory manually to `ai_memories`. Automatically calls the Embedding Service to compute its `pgvector` embedding and construct `content_tsv`.

#### Data Transfer Objects (DTO)

- **Request DTO**: `CreateMemoryDto`
  - `content` (`string`, required): Memory text content.
  - `category` (`string`, required): Memory category classifier.
  - `source` (`string`, optional, enum: `['CHAT', 'EMAIL', 'MANUAL']`): Defaults to `MANUAL`.
  - `initialScore` (`number`, optional): Base memory relevance score $S_0$ (default: 1.0).

- **Response DTO**: `MemoryResponseDto`
  - `id` (`string`): UUID of created memory.
  - `content` (`string`): Stored memory text.
  - `category` (`string`): Memory category.
  - `source` (`string`): Origin source.
  - `initialScore` (`number`): Base relevance score.
  - `decayFactor` (`number`): Score decay rate $\lambda$.
  - `createdAt` (`string`): ISO timestamp of creation.

---

### 5. Update AI Memory Content

- **Endpoint**: `PUT /api/v1/ai/memories/:id`
- **Guard / Auth**: `AuthGuard('jwt')`[cite: 1]
- **Description**: Updates an existing memory's text content, recalculates its `pgvector` embedding and `content_tsv`, and resets or updates its `decay_factor`.

#### Data Transfer Objects (DTO)

- **Request DTO**: `UpdateMemoryDto`
  - `id` (`string`, path param): UUID of memory to update.
  - `content` (`string`, optional): Updated text content.
  - `category` (`string`, optional): Updated category tag.
  - `decayFactor` (`number`, optional): Updated decay factor parameter $\lambda$.

- **Response DTO**: `MemoryResponseDto`
  - `id` (`string`): UUID of updated memory.
  - `content` (`string`): Updated text content.
  - `category` (`string`): Category tag.
  - `lastAccessedAt` (`string`): Updated access timestamp.

---

### 6. Delete AI Memory

- **Endpoint**: `DELETE /api/v1/ai/memories/:id`
- **Guard / Auth**: `AuthGuard('jwt')`[cite: 1]
- **Description**: Permanently deletes or disables a memory record from the `ai_memories` table in the knowledge base.

#### Data Transfer Objects (DTO)

- **Request DTO**: `DeleteMemoryParamsDto`
  - `id` (`string`, path param): UUID of the target memory record.

- **Response DTO**: `DeleteMemoryResponseDto`
  - `success` (`boolean`): Deletion execution result status.
  - `id` (`string`): ID of deleted memory.

---

### 7. Trigger Proactive Agent Orchestrator

- **Endpoint**: `POST /api/v1/ai/proactive/trigger`
- **Guard / Auth**: `AuthGuard('jwt')`[cite: 1]
- **Description**: Explicitly triggers the Proactive Orchestrator to assess user context, urgent schedule/events, or quiet periods, and optionally dispatch proactive push/Telegram messages.

#### Data Transfer Objects (DTO)

- **Request DTO**: `TriggerProactiveDto`
  - `reason` (`string`, optional): Manual trigger cause or contextual trace note.

- **Response DTO**: `ProactiveTriggerResponseDto`
  - `triggered` (`boolean`): Whether a proactive communication message was initiated.
  - `actionTaken` (`string`): Execution summary or skip reason.
# AI Agent & Semantic Memory Service

- **General Description**: Core business service managing real-time chat execution, Fish.audio TTS integration, `pgvector` hybrid search memory store (CRUD + RAG extraction), memory score decay processing ($S(t) = S_0 \cdot e^{-\lambda t}$), and proactive notification orchestrations.
- **Accessed Database Tables**:
  - `ai_memories`[cite: 2]
  - `memory_decay_logs`[cite: 2]
  - `rag_chunks`[cite: 2]
  - `characters`[cite: 2]
  - `personas`[cite: 2]

---

## List of Methods

### 1. streamChat

- **Task Description**: Coordinates user message processing, pulls active character persona context, performs RAG retrieval on `ai_memories`, and yields SSE streaming responses.
- **Accessed Tables**: `characters`, `personas`, `ai_memories` (Read)[cite: 2]
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `dto`: `StreamChatDto` - DTO with user chat prompt, optional character ID, and session ID.

- **Output**:
  - `Observable<MessageEvent>`: Stream of chat output tokens.

---

### 2. streamTts

- **Task Description**: Interacts with the Fish.audio API using the target character's `voice_id` to convert input text into a live streaming audio payload.
- **Accessed Tables**: `characters` (Read)[cite: 2]
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `dto`: `StreamTtsDto` - Text payload and optional voice identifier override.

- **Output**:
  - `Promise<StreamableFile>`: Streaming audio payload response.

---

### 3. searchMemories

- **Task Description**: Performs Hybrid Search on `ai_memories` utilizing `pgvector` HNSW index cosine distance and PostgreSQL `tsvector` keyword matching.
- **Accessed Tables**: `ai_memories` (Read)[cite: 2]
- **AI Tool Integration**:
  - **Tool Name**: `search_ai_memories`
  - **Tool Description**: `Queries AI semantic knowledge base using vector similarity and text keywords.`
  - **Parameters Schema**:
    - `query` (`string`, required): Search string to embed and match against stored memories.
    - `category` (`string`, optional): Optional category filter.
    - `limit` (`number`, optional): Limit number of memory results.

#### Input / Output

- **Input**:
  - `queryDto`: `QueryMemoryDto` - DTO containing text query, category, source filters, and limit.

- **Output**:
  - `Promise<MemoryListResponseDto>`: Ranked list of matched memories and scores.

---

### 4. createMemory

- **Task Description**: Saves new memory content into `ai_memories`, calls Embedding Service to build `vector(1536)` index, and generates `tsvector` representation.
- **Accessed Tables**: `ai_memories` (Write)[cite: 2]
- **AI Tool Integration**:
  - **Tool Name**: `create_ai_memory`
  - **Tool Description**: `Creates and stores a new semantic memory entry into the AI memory store.`
  - **Parameters Schema**:
    - `content` (`string`, required): Memory text content to store.
    - `category` (`string`, required): Category tag (e.g., 'preference', 'fact').

#### Input / Output

- **Input**:
  - `createDto`: `CreateMemoryDto` - Content, category, source tag, and initial score.

- **Output**:
  - `Promise<MemoryResponseDto>`: Saved memory record metadata.

---

### 5. updateMemory

- **Task Description**: Updates memory content, regenerates vector embedding, recalculates `content_tsv`, and updates `decay_factor`.
- **Accessed Tables**: `ai_memories` (Read, Write)[cite: 2]
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `id` (`string`): Target memory UUID.
  - `updateDto`: `UpdateMemoryDto` - Memory fields to update.

- **Output**:
  - `Promise<MemoryResponseDto>`: Updated memory record object.

---

### 6. deleteMemory

- **Task Description**: Deletes or disables memory record from `ai_memories` table.
- **Accessed Tables**: `ai_memories` (Write)[cite: 2]
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `id` (`string`): UUID of the memory record to remove.

- **Output**:
  - `Promise<DeleteMemoryResponseDto>`: Status flag confirming deletion.

---

### 7. triggerProactiveOrchestrator

- **Task Description**: Evaluates recent activity context, calendar events, and time elapsed to determine if a proactive message should be emitted via Telegram/Push.
- **Accessed Tables**: `ai_memories`, `memory_decay_logs` (Read, Write)[cite: 2]
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `triggerDto`: `TriggerProactiveDto` - Contextual metadata/reason for trigger request.

- **Output**:
  - `Promise<ProactiveTriggerResponseDto>`: Evaluation result and action status summary.
# Authentication & Session Controller

- **Base Endpoint**: `/api/v1/auth`
- **General Description**: Handles Master User authentication, token issuance and refresh, session termination, and active session retrieval.

---

## List of Endpoints

### 1. Master User Login

- **Endpoint**: `POST /api/v1/auth/login`
- **Guard / Auth**: None (Public)
- **Description**: Authenticates the Master User credentials. Upon successful validation, issues an Access Token in the response body and sets an HTTP-Only Refresh Token cookie. It also creates a new active record in `user_sessions` and records token metadata in `refresh_tokens`.

#### Data Transfer Objects (DTO)

- **Request DTO**: `LoginDto`
  - `username` (`string`, required): Master User username or email address.
  - `password` (`string`, required): Plaintext password for authentication.
  - `deviceId` (`string`, optional): Unique client device identifier.
  - `userAgent` (`string`, optional): User-Agent string from the HTTP request header.

- **Response DTO**: `LoginResponseDto`
  - `accessToken` (`string`): Issued JWT Access Token.
  - `tokenType` (`string`): Token type identifier (e.g., `Bearer`).
  - `expiresIn` (`number`): Access Token expiration time in seconds.
  - `session` (`SessionInfoDto`): Newly created user session summary.

---

### 2. Refresh Access Token

- **Endpoint**: `POST /api/v1/auth/refresh`
- **Guard / Auth**: None (Validates Refresh Token from HTTP-Only cookie or payload)
- **Description**: Verifies the provided Refresh Token against active records in `refresh_tokens`. If valid and non-revoked, issues a new JWT Access Token. Supports rotation/replay detection to safeguard session security.

#### Data Transfer Objects (DTO)

- **Request DTO**: `RefreshTokenDto`
  - `refreshToken` (`string`, optional): Refresh Token value if not sent via HTTP-Only cookie.

- **Response DTO**: `RefreshTokenResponseDto`
  - `accessToken` (`string`): Newly issued JWT Access Token.
  - `tokenType` (`string`): Token type identifier (e.g., `Bearer`).
  - `expiresIn` (`number`): Access Token expiration time in seconds.

---

### 3. Terminate Login Session (Logout)

- **Endpoint**: `POST /api/v1/auth/logout`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Terminates the current login session by marking or deleting the corresponding record in `user_sessions`, revoking the Refresh Token in `refresh_tokens`, and clearing the HTTP-Only cookie.

#### Data Transfer Objects (DTO)

- **Request DTO**: `LogoutDto`
  - `sessionId` (`string`, optional): Specific session ID to terminate. Defaults to current active session if omitted.

- **Response DTO**: `LogoutResponseDto`
  - `success` (`boolean`): Indicates whether the logout operation was successful.
  - `message` (`string`): Confirmation message detailing session termination.

---

### 4. Retrieve Active Session Information

- **Endpoint**: `GET /api/v1/auth/session`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Fetches current active session details from `user_sessions` and current user metadata from `users` based on the authenticated JWT Access Token.

#### Data Transfer Objects (DTO)

- **Request DTO**: `GetSessionQueryDto`
  - None (Uses Access Token payload from headers)

- **Response DTO**: `SessionInfoResponseDto`
  - `id` (`string`): Session UUID.
  - `userId` (`string`): Master User UUID.
  - `deviceId` (`string`): Registered device identifier.
  - `ipAddress` (`string`): IP address recorded during session creation/activity.
  - `userAgent` (`string`): Browser or client user-agent string.
  - `lastActiveAt` (`string`): ISO 8601 timestamp of last activity.
  - `createdAt` (`string`): ISO 8601 timestamp of session creation.
# Authentication & Session Service

- **General Description**: Manages core business logic for user authentication, session lifecycle, JWT issuance, token rotation, and credential verification.
- **Accessed Database Tables**:
  - `users`
  - `user_sessions`
  - `refresh_tokens`

---

## List of Methods

### 1. login

- **Task Description**: Validates user credentials against `users`. On successful verification, generates an Access Token and Refresh Token, persists the refresh token in `refresh_tokens`, and inserts a new active session into `user_sessions`.
- **Accessed Tables**: `users` (Read), `user_sessions` (Create), `refresh_tokens` (Create)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `loginDto`: `LoginDto` - Data transfer object containing user credentials, device ID, and user agent info.
  - `ipAddress`: `string` - Client IP address extracted from request headers.

- **Output**:
  - `Promise<{ response: LoginResponseDto; rawRefreshToken: string }>`: Access token payload, session details, and unencrypted refresh token string for cookie setup.

---

### 2. refreshAccessToken

- **Task Description**: Validates the incoming refresh token against `refresh_tokens` and verifies session status in `user_sessions`. Ensures token is not expired or revoked. Generates and returns a fresh Access Token.
- **Accessed Tables**: `refresh_tokens` (Read), `user_sessions` (Read)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `refreshToken`: `string` - Unencrypted refresh token provided by client.

- **Output**:
  - `Promise<RefreshTokenResponseDto>`: Newly generated JWT access token details.

---

### 3. logout

- **Task Description**: Revokes the active refresh token in `refresh_tokens` and removes or deactivates the corresponding session record in `user_sessions`.
- **Accessed Tables**: `refresh_tokens` (Update), `user_sessions` (Delete/Update)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `userId`: `string` - Authenticated Master User UUID.
  - `sessionId`: `string` - UUID of the session to terminate.

- **Output**:
  - `Promise<LogoutResponseDto>`: Status flag and operation result message.

---

### 4. getActiveSession

- **Task Description**: Queries `user_sessions` for session details associated with the current session ID and updates the `last_active_at` timestamp.
- **Accessed Tables**: `user_sessions` (Read, Update), `users` (Read)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `userId`: `string` - Authenticated Master User UUID.
  - `sessionId`: `string` - Current active session UUID.

- **Output**:
  - `Promise<SessionInfoResponseDto>`: Active session metadata and associated user information.
# Calendar Proxy Controller

- **Base Endpoint**: `/api/v1/calendar`
- **General Description**: Controller handling local proxy calendar event management and manual synchronization triggers between local calendar records and external Google Calendar API.

---

## List of Endpoints

### 1. Get Calendar Events List

- **Endpoint**: `GET /api/v1/calendar/events`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Retrieves local calendar events stored in the database within optional date range filters.

#### Data Transfer Objects (DTO)

- **Request DTO**: `GetCalendarEventsQueryDto`
  - `startDate` (`string`, optional): ISO 8601 start date filter.
  - `endDate` (`string`, optional): ISO 8601 end date filter.

- **Response DTO**: `CalendarEventResponseDto[]`
  - `id` (`string`): Local event UUID.
  - `title` (`string`): Title of the event.
  - `description` (`string`): Detailed description.
  - `location` (`string`): Event location.
  - `startTime` (`string`): ISO 8601 start timestamp.
  - `endTime` (`string`): ISO 8601 end timestamp.
  - `attendees` (`string[]`): Array of attendee email addresses.
  - `intent` (`string`): Event intent classification.
  - `priorityStatus` (`string`): Event priority level.
  - `syncState` (`CalendarSyncStateResponseDto`): Associated Google Calendar sync state details.
    - `googleEventId` (`string`): Google Calendar Event ID.
    - `syncStatus` (`string`, enum: `['SYNCED', 'DIRTY', 'CONFLICT']`): Sync status.
    - `lastSyncedAt` (`string`): ISO 8601 timestamp of last sync.

---

### 2. Create Calendar Event

- **Endpoint**: `POST /api/v1/calendar/events`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Creates a new event in the local calendar database and automatically triggers synchronization to Google Calendar API.

#### Data Transfer Objects (DTO)

- **Request DTO**: `CreateCalendarEventDto`
  - `title` (`string`, required): Title of the calendar event.
  - `description` (`string`, optional): Description or notes for the event.
  - `location` (`string`, optional): Event location.
  - `startTime` (`string`, required): ISO 8601 start timestamp.
  - `endTime` (`string`, required): ISO 8601 end timestamp.
  - `attendees` (`string[]`, optional): Array of attendee emails.
  - `intent` (`string`, optional): Intent tag or context.
  - `priorityStatus` (`string`, optional): Priority level.

- **Response DTO**: `CalendarEventResponseDto`
  - `id` (`string`): Local event UUID.
  - `title` (`string`): Event title.
  - `description` (`string`): Event description.
  - `location` (`string`): Event location.
  - `startTime` (`string`): Event start time.
  - `endTime` (`string`): Event end time.
  - `attendees` (`string[]`): List of attendees.
  - `intent` (`string`): Event intent.
  - `priorityStatus` (`string`): Priority status.
  - `syncState` (`CalendarSyncStateResponseDto`): Google Calendar sync metadata.

---

### 3. Update Calendar Event

- **Endpoint**: `PUT /api/v1/calendar/events/:id`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Edits an existing local calendar event and updates the dirty sync state for reconciliation with Google Calendar API.

#### Data Transfer Objects (DTO)

- **Request DTO**: `UpdateCalendarEventDto`
  - `id` (`string`, path param): Local event UUID.
  - `title` (`string`, optional): Updated event title.
  - `description` (`string`, optional): Updated description.
  - `location` (`string`, optional): Updated location.
  - `startTime` (`string`, optional): Updated ISO 8601 start timestamp.
  - `endTime` (`string`, optional): Updated ISO 8601 end timestamp.
  - `attendees` (`string[]`, optional): Updated attendees list.
  - `intent` (`string`, optional): Updated intent.
  - `priorityStatus` (`string`, optional): Updated priority status.

- **Response DTO**: `CalendarEventResponseDto`
  - `id` (`string`): Event UUID.
  - `title` (`string`): Updated title.
  - `description` (`string`): Updated description.
  - `location` (`string`): Updated location.
  - `startTime` (`string`): Updated start time.
  - `endTime` (`string`): Updated end time.
  - `attendees` (`string[]`): Updated attendees.
  - `intent` (`string`): Updated intent.
  - `priorityStatus` (`string`): Updated priority.
  - `syncState` (`CalendarSyncStateResponseDto`): Updated sync state.

---

### 4. Delete Calendar Event

- **Endpoint**: `DELETE /api/v1/calendar/events/:id`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Deletes a local calendar event and removes or cancels the synced event from Google Calendar API.

#### Data Transfer Objects (DTO)

- **Request DTO**: `DeleteCalendarEventParamsDto`
  - `id` (`string`, path param): Local event UUID to delete.

- **Response DTO**: `DeleteCalendarEventResponseDto`
  - `success` (`boolean`): Operation success status.
  - `message` (`string`): Status description message.

---

### 5. Trigger Manual Calendar Sync

- **Endpoint**: `POST /api/v1/calendar/sync`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Triggers a manual bi-directional sync process between the Local Calendar database (`local_calendars`) and the Google Calendar API.

#### Data Transfer Objects (DTO)

- **Request DTO**: None

- **Response DTO**: `CalendarSyncResponseDto`
  - `success` (`boolean`): Sync process status.
  - `syncedCount` (`number`): Number of events synchronized.
  - `conflictCount` (`number`): Number of sync conflicts detected.
  - `lastSyncedAt` (`string`): ISO 8601 timestamp of sync completion.
    Đoạn mã
# Calendar Proxy Service

- **General Description**: Service responsible for local calendar event CRUD operations, sync state management, bi-directional reconciliation with Google Calendar API, and exposed AI Tool functionality for calendar queries.
- **Accessed Database Tables**:
  - `local_calendars`
  - `calendar_sync_states`

---

## List of Methods

### 1. getEvents

- **Task Description**: Retrieves local calendar events from `local_calendars` along with their corresponding `calendar_sync_states` records. Exposed as an AI Tool for retrieving events.
- **Accessed Tables**: `local_calendars`, `calendar_sync_states` (Read)
- **AI Tool Integration**:
  - **Tool Name**: `get_calendar_events`
  - **Tool Description**: `Retrieves local DB calendar events within an optional time window.`
  - **Parameters Schema**:
    - `startDate` (`string`, optional): ISO 8601 start date timestamp.
    - `endDate` (`string`, optional): ISO 8601 end date timestamp.

#### Input / Output

- **Input**:
  - `query`: `GetCalendarEventsQueryDto` - Query containing optional startDate and endDate parameters.

- **Output**:
  - `Promise<CalendarEventResponseDto[]>`: Array of local calendar events with sync state details.

---

### 2. createEvent

- **Task Description**: Inserts a new calendar event into `local_calendars`, creates an initial sync state record in `calendar_sync_states`, and initiates an asynchronous or direct sync call to Google Calendar API. Exposed as an AI Tool for creating schedule events.
- **Accessed Tables**: `local_calendars` (Write), `calendar_sync_states` (Write)
- **AI Tool Integration**:
  - **Tool Name**: `create_calendar_event`
  - **Tool Description**: `Creates a new calendar event in local calendar and syncs to Google Calendar.`
  - **Parameters Schema**:
    - `title` (`string`, required): Event title.
    - `startTime` (`string`, required): Start time in ISO format.
    - `endTime` (`string`, required): End time in ISO format.
    - `description` (`string`, optional): Details or description.
    - `location` (`string`, optional): Event location.

#### Input / Output

- **Input**:
  - `dto`: `CreateCalendarEventDto` - Data required to create local event and populate sync fields.

- **Output**:
  - `Promise<CalendarEventResponseDto>`: Created local calendar event along with Google Calendar sync response.

---

### 3. updateEvent

- **Task Description**: Modifies an existing calendar event in `local_calendars` and marks its `calendar_sync_states.sync_status` as `DIRTY` or updates Google Calendar API directly.
- **Accessed Tables**: `local_calendars` (Read, Write), `calendar_sync_states` (Read, Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `id` (`string`): Local calendar event UUID.
  - `dto`: `UpdateCalendarEventDto` - Partial update properties for event.

- **Output**:
  - `Promise<CalendarEventResponseDto>`: Updated calendar event entity representation.

---

### 4. deleteEvent

- **Task Description**: Removes a calendar event from `local_calendars`, deletes or cancels the associated Google Calendar event via API, and cleans up `calendar_sync_states`.
- **Accessed Tables**: `local_calendars` (Read, Delete), `calendar_sync_states` (Read, Delete)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `id` (`string`): Local calendar event UUID to delete.

- **Output**:
  - `Promise<DeleteCalendarEventResponseDto>`: Deletion success confirmation status.

---

### 5. syncGoogleCalendar

- **Task Description**: Executes bi-directional synchronization between `local_calendars` and Google Calendar API by reconciling dirty or unsynced records using ETag and updated timestamp tokens, updating `calendar_sync_states`.
- **Accessed Tables**: `local_calendars` (Read, Write), `calendar_sync_states` (Read, Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**: None

- **Output**:
  - `Promise<CalendarSyncResponseDto>`: Sync metrics including count of synchronized events, conflicts detected, and completion timestamp.
# Character & Persona Controller

- **Base Endpoint**: `/api/v1/characters`
- **General Description**: Controller handling the management of AI characters and their associated persona attribute configurations (prompts, tones, identity, knowledge background, relationship dynamics, etc.).

---

## List of Endpoints

### 1. Get All Characters

- **Endpoint**: `GET /api/v1/characters`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Retrieves a list of all registered AI characters in the system.

#### Data Transfer Objects (DTO)

- **Request DTO**: `None`

- **Response DTO**: `CharacterResponseDto[]`
  - `id` (`string`): Character UUID.
  - `name` (`string`): Character name.
  - `voiceId` (`string`): Fish.audio voice ID assigned to the character.
  - `source` (`string`): Character origin source.
  - `isActive` (`boolean`): Active status flag.
  - `createdAt` (`string`): ISO timestamp of creation.
  - `updatedAt` (`string`): ISO timestamp of last update.

---

### 2. Create Character

- **Endpoint**: `POST /api/v1/characters`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Creates a new AI character entry with a specified name, voice ID, and source.

#### Data Transfer Objects (DTO)

- **Request DTO**: `CreateCharacterDto`
  - `name` (`string`, required): Character name.
  - `voiceId` (`string`, required): Fish.audio voice ID.
  - `source` (`string`, required): Origin source (e.g., Anime, Game, Original).
  - `isActive` (`boolean`, optional): Whether to immediately activate the character. Default is false.

- **Response DTO**: `CharacterResponseDto`
  - `id` (`string`): Character UUID.
  - `name` (`string`): Character name.
  - `voiceId` (`string`): Voice ID.
  - `source` (`string`): Character origin.
  - `isActive` (`boolean`): Active status.
  - `createdAt` (`string`): ISO timestamp of creation.
  - `updatedAt` (`string`): ISO timestamp of last update.

---

### 3. Update Character

- **Endpoint**: `PUT /api/v1/characters/:id`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Updates information for an existing AI character, including name, voice ID, source, or active status.

#### Data Transfer Objects (DTO)

- **Request DTO**: `UpdateCharacterDto`
  - `id` (`string`, path param, required): Character UUID.
  - `name` (`string`, optional): Updated character name.
  - `voiceId` (`string`, optional): Updated voice ID.
  - `source` (`string`, optional): Updated source.
  - `isActive` (`boolean`, optional): Updated active status.

- **Response DTO**: `CharacterResponseDto`
  - `id` (`string`): Character UUID.
  - `name` (`string`): Character name.
  - `voiceId` (`string`): Voice ID.
  - `source` (`string`): Character origin.
  - `isActive` (`boolean`): Active status.
  - `createdAt` (`string`): ISO timestamp.
  - `updatedAt` (`string`): ISO timestamp.

---

### 4. Delete Character

- **Endpoint**: `DELETE /api/v1/characters/:id`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Permanently deletes an AI character and cascades deletion to all associated persona records.

#### Data Transfer Objects (DTO)

- **Request DTO**: `DeleteCharacterParamsDto`
  - `id` (`string`, path param, required): Character UUID.

- **Response DTO**: `DeleteCharacterResponseDto`
  - `success` (`boolean`): Operation success status.
  - `message` (`string`): Result confirmation message.

---

### 5. Get Personas for Character

- **Endpoint**: `GET /api/v1/characters/:id/personas`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Retrieves all configured persona attributes (prompt, tone, identity, etc.) for a specific AI character.

#### Data Transfer Objects (DTO)

- **Request DTO**: `GetPersonasParamsDto`
  - `id` (`string`, path param, required): Character UUID.

- **Response DTO**: `PersonaResponseDto[]`
  - `id` (`string`): Persona UUID.
  - `characterId` (`string`): Parent character UUID.
  - `type` (`string`): Persona attribute type (`SYSTEM_PROMPT`, `TONE`, `IDENTITY`, `KNOWLEDGE_BACKGROUND`, `RELATIONSHIP_DYNAMICS`, `OTHER`).
  - `value` (`string`): Detailed prompt content or context value.
  - `createdAt` (`string`): ISO timestamp.
  - `updatedAt` (`string`): ISO timestamp.

---

### 6. Add Persona to Character

- **Endpoint**: `POST /api/v1/characters/:id/personas`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Adds a new persona attribute configuration (`type` and `value`) to a target AI character.

#### Data Transfer Objects (DTO)

- **Request DTO**: `CreatePersonaDto`
  - `id` (`string`, path param, required): Target character UUID.
  - `type` (`string`, required, enum: `['SYSTEM_PROMPT', 'TONE', 'IDENTITY', 'KNOWLEDGE_BACKGROUND', 'RELATIONSHIP_DYNAMICS', 'OTHER']`): Persona attribute category.
  - `value` (`string`, required): Prompt context content.

- **Response DTO**: `PersonaResponseDto`
  - `id` (`string`): Created persona UUID.
  - `characterId` (`string`): Associated character UUID.
  - `type` (`string`): Persona attribute category.
  - `value` (`string`): Persona content value.
  - `createdAt` (`string`): ISO timestamp.
  - `updatedAt` (`string`): ISO timestamp.

---

### 7. Update Persona

- **Endpoint**: `PUT /api/v1/characters/:id/personas/:personaId`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Updates a specific persona attribute configuration for a character.

#### Data Transfer Objects (DTO)

- **Request DTO**: `UpdatePersonaDto`
  - `id` (`string`, path param, required): Character UUID.
  - `personaId` (`string`, path param, required): Persona UUID.
  - `type` (`string`, optional, enum: `['SYSTEM_PROMPT', 'TONE', 'IDENTITY', 'KNOWLEDGE_BACKGROUND', 'RELATIONSHIP_DYNAMICS', 'OTHER']`): Updated persona attribute category.
  - `value` (`string`, optional): Updated prompt context content.

- **Response DTO**: `PersonaResponseDto`
  - `id` (`string`): Persona UUID.
  - `characterId` (`string`): Associated character UUID.
  - `type` (`string`): Persona attribute category.
  - `value` (`string`): Persona content value.
  - `createdAt` (`string`): ISO timestamp.
  - `updatedAt` (`string`): ISO timestamp.

---

### 8. Delete Persona

- **Endpoint**: `DELETE /api/v1/characters/:id/personas/:personaId`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Deletes a specific persona attribute configuration from a character.

#### Data Transfer Objects (DTO)

- **Request DTO**: `DeletePersonaParamsDto`
  - `id` (`string`, path param, required): Character UUID.
  - `personaId` (`string`, path param, required): Persona UUID.

- **Response DTO**: `DeletePersonaResponseDto`
  - `success` (`boolean`): Operation success status.
  - `message` (`string`): Result confirmation message.
# Documentation: API Modules

## 1. Auth Module

### Controller (`docs/modules/auth/auth.controller.md`)

#### Endpoints (`/api/v1/auth`)

- **`POST /api/v1/auth/login`**: Authenticates Master User credentials, issues Access Token, sets HTTP-Only Refresh Token cookie, creates session record in `user_sessions`, and records token metadata in `refresh_tokens`[cite: 2].
- **`POST /api/v1/auth/refresh`**: Verifies Refresh Token against `refresh_tokens` and issues a new JWT Access Token with rotation/replay protection[cite: 2].
- **`POST /api/v1/auth/logout`**: Terminates active session in `user_sessions`, revokes Refresh Token in `refresh_tokens`, and clears HTTP-Only cookie[cite: 2].
- **`GET /api/v1/auth/session`**: Fetches active session details from `user_sessions` and current user metadata from `users` based on authenticated JWT Access Token[cite: 2].

### Service (`docs/modules/auth/auth.service.md`)

#### Methods

- **`login`**: Validates credentials against `users`, generates Access/Refresh Tokens, persists refresh token in `refresh_tokens`, and creates session in `user_sessions`[cite: 1].
- **`refreshAccessToken`**: Validates incoming refresh token in `refresh_tokens` and session status in `user_sessions`, returning a fresh Access Token[cite: 1].
- **`logout`**: Revokes active refresh token in `refresh_tokens` and removes/deactivates the session in `user_sessions`[cite: 1].
- **`getActiveSession`**: Queries `user_sessions` for current session details, updates `last_active_at` timestamp, and retrieves user info[cite: 1].

---

## 2. Character Module

### Controller: `CharacterPersonaController` (`docs/modules/character/character.controller.md`)

#### Endpoints

- **`GET /api/v1/characters`**: Get the list of all AI characters.
- **`POST /api/v1/characters`**: Create a new AI character (inputs: Name, Voice ID, Source).
- **`PUT /api/v1/characters/:id`**: Update character information (Name, Voice ID, Source, Active status).
- **`DELETE /api/v1/characters/:id`**: Delete a character.
- **`GET /api/v1/characters/:id/personas`**: Get all Persona configurations (Prompt, Tone, Identity, etc.) for a specific character.
- **`POST /api/v1/characters/:id/personas`**: Add a new Persona attribute configuration for a character (`type` + `value`).
- **`PUT /api/v1/characters/:id/personas/:personaId`**: Edit a specific Persona attribute configuration.
- **`DELETE /api/v1/characters/:id/personas/:personaId`**: Delete a Persona attribute.

### Service: `CharacterPersonaService` (`docs/modules/character/character.service.md`)

#### Methods

- **`getCharacters`**: Retrieves all existing AI character records from the database.
- **`createCharacter`**: Creates a new AI character entry and manages single active character state logic.
- **`updateCharacter`**: Updates AI character details (Name, Voice ID, Source, Active status) by ID.
- **`deleteCharacter`**: Removes a character entry and cascades deletion to associated personas.
- **`getPersonasByCharacterId`**: Fetches all persona attribute configurations assigned to a given character.
- **`addPersona`**: Adds a new persona attribute (`type` and `value`) to a character.
- **`updatePersona`**: Updates an existing persona attribute's type or value after validating character ownership.
- **`deletePersona`**: Removes a specific persona attribute from a character after validating ownership.

---

## 3. Email Module

### Controller (`docs/modules/email/email.controller.md`)

#### Endpoints (`/api/v1/email`)

- **`GET /api/v1/email/google/connect`**: Generates and returns the Google OAuth2 authorization URL for connecting the main inbox.
- **`GET /api/v1/email/google/callback`**: Receives Google OAuth authorization code, exchanges it for access/refresh tokens, encrypts them, and updates user profile settings.
- **`POST /api/v1/email/webhooks/google-pubsub`**: Ingests Google Pub/Sub PUSH notifications for incoming emails, deduplicates using message IDs, checks filtering rules, and enqueues valid messages for AI processing.
- **`GET /api/v1/email/logs`**: Retrieves a paginated list of ingested email records from `email_logs` table with optional processing status filters.
- **`POST /api/v1/email/logs/:id/reprocess`**: Manually re-queues an email log record into BullMQ for AI processing.
- **`GET /api/v1/email/rules`**: Retrieves email filtering rules from `email_rules` table, optionally filtered by rule type (`blacklist`, `moneylist`, `whitelist`).
- **`POST /api/v1/email/rules`**: Creates a new email filtering rule (`blacklist`, `moneylist`, or `whitelist`).
- **`PUT /api/v1/email/rules/:id`**: Updates configuration for an existing email filtering rule by ID.
- **`DELETE /api/v1/email/rules/:id`**: Deletes an email filtering rule by ID.

### Service (`docs/modules/email/email.service.md`)

#### Methods

- **`getGoogleConnectUrl`**: Generates the Google OAuth2 consent screen redirect URL with required scopes.
- **`handleGoogleCallback`**: Handles OAuth callback, exchanges authorization code for tokens, encrypts token data, and persists encrypted tokens to `users` table.
- **`processPubSubWebhook`**: Decodes incoming Pub/Sub webhook payloads, queries Gmail API for raw email data, verifies duplication, applies email rules from `email_rules`, persists records to `email_logs`, and enqueues jobs into `queue_jobs` for BullMQ processing.
- **`getEmailLogs`**: Fetches paginated email ingestion history from `email_logs` table according to pagination and status filters.
- **`reprocessEmailLog`**: Resets email status to `PENDING` in `email_logs`, creates a job in `queue_jobs`, and re-pushes the email log ID into the BullMQ queue for AI processing.
- **`getEmailRules`**: Retrieves email filtering rules from `email_rules` table with optional filter by rule type (`blacklist`, `moneylist`, `whitelist`).
- **`createEmailRule`**: Validates pattern/matcher inputs and inserts a new rule into `email_rules` table.
- **`updateEmailRule`**: Validates existing record and updates rule attributes in `email_rules` table.
- **`deleteEmailRule`**: Verifies existence and deletes a rule record from `email_rules` table.
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
# Finance Controller

- **Base Endpoint**: `/api/v1/finance`
- **General Description**: Controller handling financial management operations including bank accounts and e-wallets listing, creation, modification, balance adjustment, income/expense transactions management, and financial summary report retrieval.

---

## List of Endpoints

### 1. Get Accounts List

- **Endpoint**: `GET /api/v1/finance/accounts`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Retrieves the list of active bank accounts and e-wallets, along with individual cached balances and total aggregate balance across all accounts.

#### Data Transfer Objects (DTO)

- **Request DTO**: None

- **Response DTO**: `AccountListResponseDto`
  - `totalAggregateBalance` (`number`): The total aggregate cached balance across all accounts.
  - `accounts` (`AccountResponseDto[]`): Array of bank accounts and e-wallets.
    - `id` (`string`): Account UUID.
    - `accountName` (`string`): Name of the account or wallet.
    - `bankCode` (`string`): Code representing the bank or provider.
    - `accountNumber` (`string`): Bank account or wallet identifier.
    - `cachedBalance` (`number`): Current cached balance.
    - `currency` (`string`): Currency unit (e.g., USD, VND).
    - `isActive` (`boolean`): Active status of the account.

---

### 2. Create Bank Account / E-Wallet

- **Endpoint**: `POST /api/v1/finance/accounts`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Adds a new bank account or e-wallet to the finance tracking system.

#### Data Transfer Objects (DTO)

- **Request DTO**: `CreateAccountDto`
  - `accountName` (`string`, required): Display name for the bank account or e-wallet.
  - `bankCode` (`string`, required): Bank identifier code.
  - `accountNumber` (`string`, required): Account or card number.
  - `initialBalance` (`number`, required): Initial starting balance for the account.
  - `currency` (`string`, required): Currency type (e.g., USD, VND).

- **Response DTO**: `AccountResponseDto`
  - `id` (`string`): Account UUID.
  - `accountName` (`string`): Name of the account.
  - `bankCode` (`string`): Bank identifier code.
  - `accountNumber` (`string`): Account number.
  - `cachedBalance` (`number`): Current cached balance.
  - `currency` (`string`): Currency code.
  - `isActive` (`boolean`): Status of the account.

---

### 3. Update Bank Account Information

- **Endpoint**: `PUT /api/v1/finance/accounts/:id`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Updates basic information of an existing bank account or e-wallet, such as account name, bank code, and currency type.

#### Data Transfer Objects (DTO)

- **Request DTO**: `UpdateAccountDto`
  - `id` (`string`, path param): Account UUID.
  - `accountName` (`string`, optional): Updated account name.
  - `bankCode` (`string`, optional): Updated bank code.
  - `currency` (`string`, optional): Updated currency type.

- **Response DTO**: `AccountResponseDto`
  - `id` (`string`): Account UUID.
  - `accountName` (`string`): Name of the account.
  - `bankCode` (`string`): Bank code.
  - `accountNumber` (`string`): Account number.
  - `cachedBalance` (`number`): Current cached balance.
  - `currency` (`string`): Currency code.
  - `isActive` (`boolean`): Status of the account.

---

### 4. Adjust Account Base Balance

- **Endpoint**: `PATCH /api/v1/finance/accounts/:id/balance`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Directly adjusts the base balance of a specific bank account or e-wallet (Manual Balance Adjustment).

#### Data Transfer Objects (DTO)

- **Request DTO**: `AdjustBalanceDto`
  - `id` (`string`, path param): Account UUID.
  - `newBalance` (`number`, required): New absolute balance value to be updated directly into cached balance.

- **Response DTO**: `AccountResponseDto`
  - `id` (`string`): Account UUID.
  - `accountName` (`string`): Name of the account.
  - `bankCode` (`string`): Bank code.
  - `accountNumber` (`string`): Account number.
  - `cachedBalance` (`number`): Adjusted cached balance.
  - `currency` (`string`): Currency code.
  - `isActive` (`boolean`): Status of the account.

---

### 5. Get Transaction History

- **Endpoint**: `GET /api/v1/finance/transactions`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Retrieves a paginated list of income and expense transaction history, with optional filtering by time range, account type, and category.

#### Data Transfer Objects (DTO)

- **Request DTO**: `GetTransactionsQueryDto`
  - `page` (`number`, optional): Page number for pagination (default: 1).
  - `limit` (`number`, optional): Limit per page (default: 10).
  - `accountId` (`string`, optional): Filter transactions by bank account ID.
  - `categoryId` (`string`, optional): Filter transactions by category ID.
  - `startDate` (`string`, optional): ISO 8601 start timestamp filter.
  - `endDate` (`string`, optional): ISO 8601 end timestamp filter.

- **Response DTO**: `PaginatedTransactionsResponseDto`
  - `data` (`TransactionResponseDto[]`): Array of transaction records.
    - `id` (`string`): Transaction UUID.
    - `accountId` (`string`): Account UUID.
    - `categoryId` (`string`): Category UUID.
    - `amount` (`number`): Transaction amount.
    - `type` (`string`): Transaction type (`INCOME` or `EXPENSE`).
    - `counterparty` (`string`): Transaction counterparty name.
    - `note` (`string`): Transaction note.
    - `transactionTime` (`string`): ISO 8601 timestamp of transaction.
    - `emailLogReferenceId` (`string`): Optional reference ID linking to email log.
  - `total` (`number`): Total records matching criteria.
  - `page` (`number`): Current page index.
  - `limit` (`number`): Current page limit size.

---

### 6. Create Transaction

- **Endpoint**: `POST /api/v1/finance/transactions`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Adds a manual income or expense transaction and automatically updates the corresponding account cached balance atomically within a database transaction.

#### Data Transfer Objects (DTO)

- **Request DTO**: `CreateTransactionDto`
  - `accountId` (`string`, required): Account UUID.
  - `categoryId` (`string`, required): Category UUID.
  - `amount` (`number`, required): Transaction amount.
  - `type` (`string`, required, enum: `['INCOME', 'EXPENSE']`): Transaction type.
  - `counterparty` (`string`, optional): Transaction recipient/sender.
  - `note` (`string`, optional): Transaction description note.
  - `transactionTime` (`string`, required): ISO 8601 timestamp.
  - `emailLogReferenceId` (`string`, optional): Referenced email log ID.

- **Response DTO**: `TransactionResponseDto`
  - `id` (`string`): Created transaction UUID.
  - `accountId` (`string`): Account UUID.
  - `categoryId` (`string`): Category UUID.
  - `amount` (`number`): Transaction amount.
  - `type` (`string`): Transaction type (`INCOME` or `EXPENSE`).
  - `counterparty` (`string`): Counterparty detail.
  - `note` (`string`): Transaction note.
  - `transactionTime` (`string`): Transaction time.
  - `emailLogReferenceId` (`string`): Linked email log ID if present.

---

### 7. Update Transaction Details

- **Endpoint**: `PUT /api/v1/finance/transactions/:id`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Modifies transaction details (amount, note, category, transaction time) and automatically calculates and adjusts the balance delta on the target account.

#### Data Transfer Objects (DTO)

- **Request DTO**: `UpdateTransactionDto`
  - `id` (`string`, path param): Transaction UUID.
  - `accountId` (`string`, optional): Target account UUID.
  - `categoryId` (`string`, optional): Category UUID.
  - `amount` (`number`, optional): Updated transaction amount.
  - `type` (`string`, optional, enum: `['INCOME', 'EXPENSE']`): Updated transaction type.
  - `counterparty` (`string`, optional): Updated counterparty name.
  - `note` (`string`, optional): Updated note.
  - `transactionTime` (`string`, optional): Updated ISO 8601 timestamp.

- **Response DTO**: `TransactionResponseDto`
  - `id` (`string`): Updated transaction UUID.
  - `accountId` (`string`): Account UUID.
  - `categoryId` (`string`): Category UUID.
  - `amount` (`number`): Updated amount.
  - `type` (`string`): Updated type.
  - `counterparty` (`string`): Updated counterparty.
  - `note` (`string`): Updated note.
  - `transactionTime` (`string`): Updated timestamp.
  - `emailLogReferenceId` (`string`): Linked email log reference ID.

---

### 8. Delete Transaction

- **Endpoint**: `DELETE /api/v1/finance/transactions/:id`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Deletes a transaction and performs a complete balance reversal on the associated bank account atomically.

#### Data Transfer Objects (DTO)

- **Request DTO**: `DeleteTransactionParamsDto`
  - `id` (`string`, path param): Transaction UUID to delete.

- **Response DTO**: `DeleteTransactionResponseDto`
  - `success` (`boolean`): Operation success status.
  - `message` (`string`): Status description message.

---

### 9. Get Financial Summary Report

- **Endpoint**: `GET /api/v1/finance/summary`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Generates an overview report of financial fluctuations including total income, total expenses, net balance changes, and cash flow/category breakdown chart data across Daily, Weekly, Monthly, or Yearly cycles.

#### Data Transfer Objects (DTO)

- **Request DTO**: `FinanceSummaryQueryDto`
  - `period` (`string`, required, enum: `['day', 'week', 'month', 'year']`): Summary aggregation cycle.
  - `month` (`number`, optional): Month integer (1-12) for specific filtering.
  - `year` (`number`, optional): Year integer for filtering.

- **Response DTO**: `FinanceSummaryResponseDto`
  - `totalIncome` (`number`): Total aggregate income for the period.
  - `totalExpenses` (`number`): Total aggregate expenses for the period.
  - `netChange` (`number`): Net change in financial balance (income - expenses).
  - `categoryBreakdown` (`CategoryBreakdownDto[]`): Spending/income breakdown grouped by categories.
    - `categoryId` (`string`): Category UUID.
    - `categoryName` (`string`): Category name.
    - `totalAmount` (`number`): Sum of transactions in this category.
  - `chartData` (`ChartDataPointDto[]`): Time-series metrics for cash flow plotting.
    - `label` (`string`): Time label (e.g., date, week number, or month).
    - `income` (`number`): Income amount in the time slice.
    - `expenses` (`number`): Expenses amount in the time slice.
# Finance Service

- **General Description**: Service responsible for managing bank accounts, processing income/expense transactions with atomic balance updates/reversals, maintaining transactional integrity, generating financial summaries, and integrating AI Tools for financial querying.
- **Accessed Database Tables**:
  - `bank_accounts`
  - `transactions`
  - `categories`

---

## List of Methods

### 1. getAccounts

- **Task Description**: Fetches all active bank accounts and e-wallets, calculates the aggregate cached balance, and returns account details.
- **Accessed Tables**: `bank_accounts` (Read)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**: None

- **Output**:
  - `Promise<AccountListResponseDto>`: List of accounts with individual cached balances and total aggregate balance.

---

### 2. createAccount

- **Task Description**: Creates a new bank account or e-wallet record in `bank_accounts` with an initial cached balance.
- **Accessed Tables**: `bank_accounts` (Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `dto`: `CreateAccountDto` - Data containing accountName, bankCode, accountNumber, initialBalance, and currency.

- **Output**:
  - `Promise<AccountResponseDto>`: Newly created account entity representation.

---

### 3. updateAccount

- **Task Description**: Updates bank account metadata (account name, bank code, currency type) in `bank_accounts`.
- **Accessed Tables**: `bank_accounts` (Read, Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `id` (`string`): Account UUID.
  - `dto`: `UpdateAccountDto` - Metadata updates for the target bank account.

- **Output**:
  - `Promise<AccountResponseDto>`: Updated account entity representation.

---

### 4. adjustBalance

- **Task Description**: Manually updates the cached balance of a bank account to a specified absolute value.
- **Accessed Tables**: `bank_accounts` (Read, Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `id` (`string`): Account UUID.
  - `dto`: `AdjustBalanceDto` - Direct balance adjustment parameters containing `newBalance`.

- **Output**:
  - `Promise<AccountResponseDto>`: Bank account entity with the newly adjusted cached balance.

---

### 5. getTransactions

- **Task Description**: Retrieves a paginated list of transactions filtered by account, category, or date range.
- **Accessed Tables**: `transactions`, `bank_accounts`, `categories` (Read)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `query`: `GetTransactionsQueryDto` - Query parameters including page, limit, accountId, categoryId, startDate, and endDate.

- **Output**:
  - `Promise<PaginatedTransactionsResponseDto>`: Paginated transaction entities with metadata total count.

---

### 6. createTransaction

- **Task Description**: Inserts a new transaction record into `transactions` and updates `bank_accounts.cached_balance` atomically (increments balance for `INCOME`, decrements balance for `EXPENSE`).
- **Accessed Tables**: `transactions` (Write), `bank_accounts` (Read, Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `dto`: `CreateTransactionDto` - Data including accountId, categoryId, amount, type, counterparty, note, transactionTime, and emailLogReferenceId.

- **Output**:
  - `Promise<TransactionResponseDto>`: Created transaction entity.

---

### 7. updateTransaction

- **Task Description**: Updates an existing transaction's details, calculates the net delta between old and new amount/type, and atomically adjusts the corresponding account cached balance.
- **Accessed Tables**: `transactions` (Read, Write), `bank_accounts` (Read, Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `id` (`string`): Transaction UUID.
  - `dto`: `UpdateTransactionDto` - Updated fields for amount, type, note, category, counterparty, or transaction time.

- **Output**:
  - `Promise<TransactionResponseDto>`: Updated transaction entity.

---

### 8. deleteTransaction

- **Task Description**: Deletes a transaction from `transactions` and performs a complete balance reversal on `bank_accounts.cached_balance` atomically.
- **Accessed Tables**: `transactions` (Read, Delete), `bank_accounts` (Read, Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `id` (`string`): Transaction UUID to delete.

- **Output**:
  - `Promise<DeleteTransactionResponseDto>`: Deletion success confirmation status.

---

### 9. getFinanceSummary

- **Task Description**: Calculates total income, total expenses, net cash flow changes, category breakdowns, and time-series chart data for specified time periods (day, week, month, year). Exposed as an AI Tool for assistant queries.
- **Accessed Tables**: `transactions`, `bank_accounts`, `categories` (Read)
- **AI Tool Integration**:
  - **Tool Name**: `get_finance_summary`
  - **Tool Description**: `Retrieves an overall financial fluctuation report (income, expenses, balance) by time period.`
  - **Parameters Schema**:
    - `period` (`string`, required, enum: `['day', 'week', 'month', 'year']`): Reporting period to retrieve.
    - `month` (`number`, optional): Month to query (1-12).
    - `year` (`number`, optional): Year to query.

#### Input / Output

- **Input**:
  - `query`: `FinanceSummaryQueryDto` - Aggregation filter options for period, month, and year.

- **Output**:
  - `Promise<FinanceSummaryResponseDto>`: Overview summary report containing totals, category breakdowns, and chart data points.
