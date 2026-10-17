# Secretary — Database

Taken from `server/prisma/schema.prisma` and the migrations in `server/prisma/migrations` (last checked 2026-10-17).
Postgres with the `pgvector` extension. Every table name below is the `@@map` name in the schema.

## Tables

| 1. Auth, character | 2. Email, queue | 3. Finance, calendar | 4. AI memory | 5. Chat |
|---|---|---|---|---|
| `users`<br>`user_sessions`<br>`refresh_tokens`<br>`characters`<br>`personas` | `email_logs`<br>`email_rules`<br>`queue_jobs` (unused) | `bank_accounts`<br>`transactions`<br>`categories`<br>`local_calendars`<br>`calendar_sync_states` | `ai_memories`<br>`rag_chunks` (unused) | `chat_sessions`<br>`chat_messages` |

All primary keys are `id` (UUID string). `created_at` defaults to now; `updated_at` is maintained by Prisma where
listed. Stored times are UTC.

---

## 1. Auth, character and persona

### `users`

The single master user.

| Column | Type | Notes |
|--------|------|-------|
| `email` | text, unique | |
| `password_hash` | text, null | bcrypt. |
| `google_access_token`, `google_refresh_token` | text, null | Encrypted with AES-256-GCM, stored as `v1:<iv>:<tag>:<ciphertext>` (`TOKEN_ENCRYPTION_KEY`). |
| `google_token_expires_at` | timestamp, null | |
| `gmail_history_id` | text, null | Gmail history ID up to which mail has been ingested (Pub/Sub push). Written only after a complete pass. |
| `is_active` | boolean, default true | |
| `created_at`, `updated_at` | timestamp | |

### `user_sessions`

One row per login. The access token is checked against this table on every request; deleting the row logs the
session out.

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | FK `users.id`, cascade | Indexed. |
| `device_id` | text, null | Kept for future multi-device support. Never written today. |
| `ip_address`, `user_agent` | text, null | Recorded at login. |
| `last_active_at`, `created_at` | timestamp | |

This is the **login** session. It is unrelated to a chat session (section 5).

### `refresh_tokens`

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | FK `users.id`, cascade | Indexed. |
| `session_id` | FK `user_sessions.id`, cascade | Indexed. |
| `token_hash` | text, unique | SHA-256 of the refresh token. The token itself is not stored. |
| `is_revoked` | boolean, default false | Set on rotation; presenting a revoked token ends the session. |
| `expires_at`, `created_at` | timestamp | |

### `characters`

| Column | Type | Notes |
|--------|------|-------|
| `name` | text | |
| `voice_id` | text, null | Fish.audio voice. |
| `source` | text, null | Origin of the character. |
| `memory_rule` | text, null | The rule that tells the AI which chat messages are important enough to become a memory (max 2000 characters, set through `memoryRule` on create / update). Null = built-in default rule in `AgentService`. |
| `created_at`, `updated_at` | timestamp | |

### `personas`

| Column | Type | Notes |
|--------|------|-------|
| `character_id` | FK `characters.id`, cascade | |
| `type` | enum `PersonaType` | `SYSTEM_PROMPT`, `TONE`, `IDENTITY`, `KNOWLEDGE_BACKGROUND`, `RELATIONSHIP_DYNAMICS`, `OTHER`. |
| `value` | text | Prompt text. All personas of the character are joined into the chat system instruction. |
| `created_at`, `updated_at` | timestamp | |

---

## 2. Email and queue

### `email_logs`

| Column | Type | Notes |
|--------|------|-------|
| `message_id` | text, unique | The email's `Message-ID`. The only deduplication key: insert, and a unique violation means "already ingested". |
| `sender` | text | |
| `subject` | text, null | |
| `raw_body` | text, null | |
| `ai_summary` | text, null | Summary written by the classification call. |
| `status` | enum `EmailStatus`, default `PENDING` | `PENDING`, `PROCESSED`, `SKIPPED` (blacklist), `FAILED` (retries exhausted). Indexed. |
| `created_at` | timestamp | |

### `email_rules`

| Column | Type | Notes |
|--------|------|-------|
| `type` | enum `EmailRuleType` | `blacklist` (saved `SKIPPED`, never sent to the model), `moneylist` (finance prompt, priority 1), `whitelist` (important-sender prompt, priority 2). Precedence blacklist > moneylist > whitelist. |
| `matcher` | enum `EmailMatcher` | `sender`, `keyword`, `regex`. |
| `match_value` | text | Address or domain, keyword, or regex (max 200 characters, syntax-checked). |
| `description` | text, null | |
| `is_active` | boolean, default true | |
| `created_at`, `updated_at` | timestamp | |

### `queue_jobs` — kept, unused

`job_id` (unique), `queue_name`, `payload` (JSON), `retry_count`, `error_log`, timestamps. Nothing reads or writes
it: BullMQ keeps job state in Redis.

---

## 3. Finance and calendar

### `bank_accounts`

`account_name`, `bank_code`, `account_number`, `cached_balance` (`decimal(18,2)`, default 0), `currency`
(default `VND`), `is_active`, timestamps. The balance changes only by `increment` / `decrement` inside the
transaction that inserts a ledger row.

### `transactions`

| Column | Type | Notes |
|--------|------|-------|
| `account_id` | FK `bank_accounts.id`, **restrict** | An account with transactions cannot be deleted, only deactivated. |
| `category_id` | FK `categories.id`, set null | Category type must equal the transaction type. |
| `amount` | `decimal(18,2)` | |
| `type` | enum `TransactionType` | `INCOME`, `EXPENSE`. |
| `counterparty`, `note` | text, null | |
| `transaction_time` | timestamp | |
| `email_log_id` | FK `email_logs.id`, set null, **unique** | One transaction per email: a worker retry cannot create a second one. |
| `created_at` | timestamp | |

Indexes: `(account_id, transaction_time)`, `(category_id)`.

### `categories`

`name`, `type` (`TransactionType`), `icon`, `budget_limit` (`decimal(18,2)`, null), `created_at`.

### `local_calendars`

`title`, `description`, `location`, `start_time`, `end_time`, `attendees` (JSON), `intent`, `priority_status`,
`deleted_at` (soft delete: the row is removed after the sync deletes it on Google), `reminded_at` (the reminder
for the current `start_time` was delivered), timestamps. Index on `start_time`.

### `calendar_sync_states`

`local_event_id` (FK `local_calendars.id`, cascade, unique), `google_event_id`, `sync_status` (enum `SyncStatus`:
`SYNCED`, `DIRTY`, `CONFLICT`; default `DIRTY`; indexed), `last_synced_at`, `etag`, timestamps.

---

## 4. AI memory (pgvector)

### `ai_memories`

The only table with an embedding. It holds long-term memories, **not** chat transcripts.

| Column | Type | Notes |
|--------|------|-------|
| `content` | text | |
| `embedding` | `vector(1536)`, null | HNSW index `ai_memories_embedding_hnsw` (`vector_cosine_ops`), hand-written in a migration. |
| `content_tsv` | `tsvector`, null | GIN index `ai_memories_content_tsv_gin`, hand-written. Text search configuration `simple`. |
| `category` | text, null | Default `GENERAL` when the service saves a memory without one. |
| `source` | text, null | `CHAT` (set by `save_user_memory`), `MANUAL` (default of `POST /ai-agent/memories`, which accepts any string). No code that runs writes `EMAIL`: the unused `RagChunkService` would write `EMAIL` and `TRANSACTION`. |
| `initial_score` | float, default 1.0 | S0. |
| `decay_factor` | float, default 0.01 | λ. Decay `S0 · e^(−λt)` is computed at query time; there is no decay job and no decay log. |
| `last_accessed_at` | timestamp | Refreshed when a search returns the memory. |
| `created_at`, `updated_at` | timestamp | |

What writes here: `POST /ai-agent/memories`, and the AI tool `save_user_memory`. The tool is the
way the AI marks a chat message important; nothing else copies chat content into this table.

### `rag_chunks` — kept, unused

`source_id`, `chunk_text`, `metadata` (JSON), `created_at`. `RagChunkService` can fill it; nothing calls that
service and nothing reads the table.

---

## 5. Chat

The server stores every chat session and message; the client sends no history.

Rules:

1. Chat sessions and messages live in these two relational tables. They are **never** stored in the vector store:
   no `vector` column, no `tsvector` column, no embedding computed for a message as such.
2. `chat_messages.content` holds the **full** message, both what the user sent and what the model answered.
3. Only a message the AI marks important, by the rule configured on the character (`characters.memory_rule`),
   produces a row in `ai_memories`. `chat_messages.memory_id` points to it.
4. The history of a turn is read from `chat_messages`: up to the last 20 earlier messages of the session. Rows with
   empty text are dropped, and the history starts at a user turn.

### `chat_sessions` — model `ChatSession`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Returned to the client and sent back as `sessionId`. |
| `user_id` | FK `users.id`, cascade | Owner. A session is readable only by its owner. |
| `character_id` | FK `characters.id`, set null, null | The character the session was started with. |
| `title` | text, null | First 80 characters of the first user message. |
| `last_message_at` | timestamp, default now | Updated with every stored message; list order. |
| `created_at`, `updated_at` | timestamp | |

Index: `(user_id, last_message_at)`.

### `chat_messages` — model `ChatMessage`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | |
| `session_id` | FK `chat_sessions.id`, cascade | |
| `role` | enum `ChatRole` | `USER` (sent by the user), `MODEL` (received from the model). |
| `content` | text | The full message text. Not truncated. |
| `tool_calls` | JSON, null | On a `MODEL` row: the tool calls of the turn with their results, or the pending `actionId` of a write that awaits confirmation. Not replayed to the model. |
| `memory_id` | FK `ai_memories.id`, set null, null, unique | Set when this message was marked important. Null for every other message. |
| `created_at` | timestamp | |

Index: `(session_id, created_at)`.

Deleting a session deletes its messages. Memories made from them stay: the foreign key is on the message side.

Migration: `20261013130000_chat_sessions_messages`.

---

## Indexes that exist only in migrations

`schema.prisma` does not know these two. A generated migration will try to drop them: delete those `DROP INDEX`
statements before applying.

| Index | Table | Definition |
|-------|-------|------------|
| `ai_memories_embedding_hnsw` | `ai_memories` | HNSW, `vector_cosine_ops`. |
| `ai_memories_content_tsv_gin` | `ai_memories` | GIN on `content_tsv`. |
