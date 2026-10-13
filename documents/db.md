# Secretary — Database

Taken from `server/prisma/schema.prisma` and the migrations in `server/prisma/migrations` (2026-10-13).
Postgres with the `pgvector` extension. Every table name below is the `@@map` name in the schema.

Status tags: `[Implemented]` = in the schema and migrations today. `[Planned]` = designed, not in the schema yet.

## Change log

| Date | Change |
|------|--------|
| 2026-10-13 | Rewritten from the schema. Removed `memory_decay_logs` (dropped, D6) and `email_logs` "deduplication hash" (dropped, D12). Corrected: refresh tokens are SHA-256 hashes, not encrypted; the embedding is 1536 dimensions only; `rag_chunks`, `queue_jobs` and `user_sessions.device_id` are kept but unused (D7, D11, D14). Added `users.gmail_history_id`, `email_logs.ai_summary`, `local_calendars.deleted_at` / `reminded_at`, the indexes and the `onDelete` rules. |
| 2026-10-13 | Added section 5 "Chat" `[Planned]`: tables `chat_sessions` and `chat_messages`, enum `ChatRole`, column `characters.memory_rule` (D19, D20). Chat is stored in full in relational tables and never in the vector store; `chat_messages.memory_id` is the only link from a chat message to `ai_memories`. |

## Tables

| 1. Auth, character | 2. Email, queue | 3. Finance, calendar | 4. AI memory | 5. Chat `[Planned]` |
|---|---|---|---|---|
| `users`<br>`user_sessions`<br>`refresh_tokens`<br>`characters`<br>`personas` | `email_logs`<br>`email_rules`<br>`queue_jobs` (unused) | `bank_accounts`<br>`transactions`<br>`categories`<br>`local_calendars`<br>`calendar_sync_states` | `ai_memories`<br>`rag_chunks` (unused) | `chat_sessions`<br>`chat_messages` |

All primary keys are `id` (UUID string). `created_at` defaults to now; `updated_at` is maintained by Prisma where
listed. Stored times are UTC.

---

## 1. Auth, character and persona `[Implemented]`

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
| `device_id` | text, null | Kept by D14 for future multi-device support. Never written today. |
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
| `is_active` | boolean, default false | Exactly one active character: partial unique index `characters_single_active` (`WHERE is_active`), hand-written in a migration and unknown to `schema.prisma`. |
| `memory_rule` | text, null | `[Planned]` (D20). The rule that tells the AI which chat messages are important enough to become a memory. Null = built-in default rule. Storage form unconfirmed (`next-steps.md` section 2.2, D20-a). |
| `created_at`, `updated_at` | timestamp | |

### `personas`

| Column | Type | Notes |
|--------|------|-------|
| `character_id` | FK `characters.id`, cascade | |
| `type` | enum `PersonaType` | `SYSTEM_PROMPT`, `TONE`, `IDENTITY`, `KNOWLEDGE_BACKGROUND`, `RELATIONSHIP_DYNAMICS`, `OTHER`. |
| `value` | text | Prompt text. All personas of the character are joined into the chat system instruction. |
| `created_at`, `updated_at` | timestamp | |

---

## 2. Email and queue `[Implemented]`

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

### `queue_jobs` — kept, unused (D11)

`job_id` (unique), `queue_name`, `payload` (JSON), `retry_count`, `error_log`, timestamps. Nothing reads or writes
it: BullMQ keeps job state in Redis.

---

## 3. Finance and calendar `[Implemented]`

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

## 4. AI memory (pgvector) `[Implemented]`

### `ai_memories`

The only table with an embedding. It holds long-term memories, **not** chat transcripts (D19).

| Column | Type | Notes |
|--------|------|-------|
| `content` | text | |
| `embedding` | `vector(1536)`, null | HNSW index `ai_memories_embedding_hnsw` (`vector_cosine_ops`), hand-written in a migration. |
| `content_tsv` | `tsvector`, null | GIN index `ai_memories_content_tsv_gin`, hand-written. Text search configuration `simple`. |
| `category` | text, null | |
| `source` | text, null | `CHAT` (saved by the AI during a chat), `MANUAL` (`POST /ai-agent/memories`). `EMAIL` is reserved and not written today. |
| `initial_score` | float, default 1.0 | S0. |
| `decay_factor` | float, default 0.01 | λ. Decay `S0 · e^(−λt)` is computed at query time; there is no decay job and no decay log (D6). |
| `last_accessed_at` | timestamp | Refreshed when a search returns the memory. |
| `created_at`, `updated_at` | timestamp | |

What writes here: `POST /ai-agent/memories`, and the AI tool `save_user_memory`. After task 6.4 the tool is the
way the AI marks a chat message important (D20); nothing else copies chat content into this table.

### `rag_chunks` — kept, unused (D7)

`source_id`, `chunk_text`, `metadata` (JSON), `created_at`. `RagChunkService` can fill it; nothing calls that
service and nothing reads the table.

---

## 5. Chat `[Planned]` — task 6.4, decisions D19 and D20

Not in `schema.prisma` yet. Today the server stores no chat: the client sends the recent turns with every request.

Rules:

1. Chat sessions and messages live in these two relational tables. They are **never** stored in the vector store:
   no `vector` column, no `tsvector` column, no embedding computed for a message as such.
2. `chat_messages.content` holds the **full** message, both what the user sent and what the model answered.
3. Only a message the AI marks important, by the rule configured on the character (`characters.memory_rule`),
   produces a row in `ai_memories`. `chat_messages.memory_id` points to it.

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

Migration name: `chat_sessions_messages`.

---

## Indexes that exist only in migrations

`schema.prisma` does not know these three. A generated migration will try to drop them: delete those `DROP INDEX`
statements before applying.

| Index | Table | Definition |
|-------|-------|------------|
| `characters_single_active` | `characters` | Partial unique, `WHERE is_active`. |
| `ai_memories_embedding_hnsw` | `ai_memories` | HNSW, `vector_cosine_ops`. |
| `ai_memories_content_tsv_gin` | `ai_memories` | GIN on `content_tsv`. |
