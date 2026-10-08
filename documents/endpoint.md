## II. Updated Backend API Endpoints List (`docs/backend/`)

### 1. Shared, Auth & Persona Management Module (`docs/backend/shared/`)

Purpose: Single-User Authentication, Session Management, Character and Persona attribute management.

#### A. Authentication & Session

- **`POST /api/v1/auth/login`**: Master User login (Returns Access Token & HTTP-Only Refresh Cookie).
- **`POST /api/v1/auth/refresh`**: Issue new Access Token from Refresh Token.
- **`POST /api/v1/auth/logout`**: Terminate the login session in `user_sessions`.
- **`GET /api/v1/auth/session`**: Retrieve active session information.
- **`GET /api/v1/auth/google/connect`**: Returns Google OAuth2 setup URL with Gmail API (`https://mail.google.com/`) and Calendar API (`https://www.googleapis.com/auth/calendar`) scopes.
- **`GET /api/v1/auth/google/callback`**: Receives OAuth Callback code, exchanges for access & refresh tokens, and saves encrypted tokens in `users`.

#### B. Character & Persona Management

- **`GET /api/v1/characters`**: Get the list of all AI characters.
- **`POST /api/v1/characters`**: Create a new AI character (inputs Name, Voice ID, Source).
- **`PUT /api/v1/characters/:id`**: Update character information (Name, Voice ID, Source, Active status).
- **`PATCH /api/v1/characters/:id/activate`**: Activate a specific character and set all other characters to `isActive = false`.
- **`DELETE /api/v1/characters/:id`**: Delete a character.
- **`GET /api/v1/characters/:id/personas`**: Get all Persona configurations (Prompt, Tone, Identity...) for a specific character.
- **`POST /api/v1/characters/:id/personas`**: Add a new Persona attribute configuration for a character (`type` + `value`).
- **`PUT /api/v1/characters/:id/personas/:personaId`**: Edit a specific Persona attribute configuration.
- **`DELETE /api/v1/characters/:id/personas/:personaId`**: Delete a Persona attribute.

### 2. Email Module (`docs/backend/email-module/`)

Purpose: Webhook Ingestion with token authorization, and Centralized Email Rules Management (`email_rules`).

#### A. Ingestion & Webhooks

- **`POST /api/v1/email/webhooks/google-pubsub`**: Ingestion Webhook receiving PUSH notifications from Google Pub/Sub with Authorization Header/Token validation.
- **`GET /api/v1/email/logs`**: Retrieve the list of ingested emails.
- **`POST /api/v1/email/logs/:id/reprocess`**: Push email to BullMQ for re-analysis by AI.

#### B. Consolidated Email Rules Management (`email_rules`)

- **`GET /api/v1/email/rules`**: Get the list of email filtering rules (Filter by `type`: `blacklist`/`moneylist`/`whitelist`).
- **`POST /api/v1/email/rules`**: Create a new rule (Passes `type`, `matcher`: `sender`/`keyword`/`regex`, `matchValue`).
- **`PUT /api/v1/email/rules/:id`**: Update filter rule information.
- **`DELETE /api/v1/email/rules/:id`**: Delete an email filter rule.

### 3. Finance & Calendar Proxy Module (`docs/backend/finance-module/`)

Purpose: Balance management, transaction updates/edits, categories management, overall financial reports, and calendar sync.

#### A. Finance, Accounts & Categories

- **`GET /api/v1/finance/accounts`**: Get list of bank accounts/e-wallets along with balances and total aggregate balance (**Total Account**).
- **`POST /api/v1/finance/accounts`**: Add new bank account / e-wallet.
- **`PUT /api/v1/finance/accounts/:id`**: Edit account name, bank code, currency type.
- **`PATCH /api/v1/finance/accounts/:id/balance`**: Directly adjust base balance (Manual Balance Adjustment).
- **`GET /api/v1/finance/categories`**: Get list of income and expense categories (filterable by `type`: `INCOME`/`EXPENSE`).
- **`POST /api/v1/finance/categories`**: Create a new income/expense category (Name, Type, Icon, Budget Limit).
- **`PUT /api/v1/finance/categories/:id`**: Edit category information (Name, Type, Icon, Budget Limit).
- **`DELETE /api/v1/finance/categories/:id`**: Delete a category (guards referential integrity with linked transactions).
- **`GET /api/v1/finance/transactions`**: Get income/expense transaction history (Paginated, Filter by time, account type, category).
- **`POST /api/v1/finance/transactions`**: Add a manual transaction (Automatically updates available balance atomically).
- **`PUT /api/v1/finance/transactions/:id`**: Edit transaction details (Amount, note, category, time) and calculate automatic balance adjustment.
- **`DELETE /api/v1/finance/transactions/:id`**: Delete transaction and complete balance reversal (Revert balance effect).
- **`GET /api/v1/finance/summary`**: Overview report of financial fluctuations (Total income, total expenses, chart analysis by cash flow/category) by Daily / Weekly / Monthly / Yearly cycles.

#### B. Local Calendar Proxy

- **`GET /api/v1/calendar/events`**: Retrieve local DB calendar events.
- **`POST /api/v1/calendar/events`**: Create a new calendar event and sync to Google Calendar.
- **`PUT /api/v1/calendar/events/:id`**: Edit an event.
- **`DELETE /api/v1/calendar/events/:id`**: Delete an event.
- **`POST /api/v1/calendar/sync`**: Trigger manual sync between Local Calendar and Google Calendar API.

### 4. AI Agent & Semantic Memory Module (`docs/backend/ai-agent-module/`)

Purpose: Interactive chat, Streaming TTS, AI Memory CRUD Management (`pgvector`), and Proactive Triggers.

#### A. Interactive Chat & Voice

- **`POST /api/v1/ai/chat/stream`**: Streaming chat endpoint (Server-Sent Events / SSE) for direct interaction with the AI Agent.
- **`POST /api/v1/ai/tts/stream`**: Receives text and returns Audio Stream from Fish.audio API according to the active Character's Voice ID.

#### B. AI Memory Management (CRUD + Vector Search)

- **`GET /api/v1/ai/memories`**: Query & Search AI memory list (Supports Hybrid Search queries: Vector Cosine + `tsvector` Keyword).
- **`POST /api/v1/ai/memories`**: Manually add a new memory (Automatically calls Embedding Service to generate `pgvector` vector and store `content_tsv`).
- **`PUT /api/v1/ai/memories/:id`**: Update memory content (Re-updates Text, recalculates Vector Embedding, and resets/updates `decay_factor`).
- **`DELETE /api/v1/ai/memories/:id`**: Permanently delete or disable a memory from the AI knowledge base.

#### C. Proactive Agent Trigger

- **`POST /api/v1/ai/proactive/trigger`**: Manually trigger the Proactive Orchestrator (Checks context, urgent events, and dispatches proactive push messages via Telegram/Push Notification). The **3-hour Quiet Fallback Cron** runs automatically server-side via `@Cron()` in `AiService` — no external endpoint required.

---

## III. Summary of Technical Documentation Layer File Structure (`docs/`)

docs/
├── database/
│ ├── 01-core-auth-schema.md
│ ├── 02-email-queue-schema.md
│ ├── 03-finance-calendar-schema.md
│ └── 04-ai-memory-pgvector.md
├── ai-memory/
│ ├── 01-vector-schema-and-indexing.md
│ ├── 02-rag-extraction-pipeline.md
│ └── 03-memory-decay-and-pruning.md
└── backend/
├── shared/
│ ├── auth-guard.md
│ ├── session.md
│ └── characters-personas.md
├── email-module/
│ ├── ingestion.md
│ ├── email-rules.md
│ └── bullmq-parser-worker.md
├── finance-module/
│ ├── accounts.md
│ ├── transactions.md
│ ├── finance-summary.md
│ └── calendar-proxy.md
└── ai-agent-module/
├── chat-stream.md
├── memory-crud-hybrid-search.md
└── proactive-orchestrator.md
