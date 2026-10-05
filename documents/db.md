## I. Updated Database Tables List (`docs/database/`)

| 1. CORE AUTH & PERSONA ARCHITECTURE                                                     | 2. EMAIL & QUEUE ENGINE                                                                        | 3. FINANCE & CALENDAR PROXY                                                                                | 4. AI MEMORY (PGVECTOR & RAG)                               |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| _ `users`<br>_ `user_sessions`<br>_ `refresh_tokens`<br>_ `characters`<br>\* `personas` | _ `email_logs`<br>_ `email_rules`<br> _(blacklist / moneylist / whitelist)_<br>\* `queue_jobs` | _ `bank_accounts`<br>_ `transactions`<br>_ `categories`<br>_ `local_calendars`<br>\* `calendar_sync_state` | _ `ai_memories`<br>_ `memory_decay_logs`<br>\* `rag_chunks` |

### 1. Core Auth, Character & Persona Schema (`01-core-auth-schema.md`)

- **`users`**: Stores the single Master User (hashed credentials, encrypted Google OAuth tokens, status).
- **`user_sessions`**: Manages multi-platform sessions (Web/Mobile) with Device ID, IP, User-Agent, Last Active.
- **`refresh_tokens`**: Manages encrypted JWT Refresh Tokens (Expiration, Revoked Status, Replay Prevention).
- **`characters`**: Stores the catalog of AI characters:
  - `id`: UUID.
  - `name`: Character name (e.g., _Kuru Kuru_, _AI Assistant_).
  - `voice_id`: Voice ID integrated with Fish.audio API.
  - `source`: Character origin (e.g., _Honkai Star Rail_, _Custom Original_, _Anime X_).
  - `is_active`: Whether currently selected and active.
- **`personas`**: Stores detailed attribute configurations for each character:
  - `id`: UUID.
  - `character_id`: Foreign Key pointing to `characters(id)`.
  - `type`: Enum/String including character data types (`SYSTEM_PROMPT`, `TONE`, `IDENTITY`, `KNOWLEDGE_BACKGROUND`, `RELATIONSHIP_DYNAMICS`, `OTHER`).
  - `value`: Text containing the prompt content / configuration context.

### 2. Email & Processing Queue Schema (`02-email-queue-schema.md`)

- **`email_logs`**: Logs of all emails ingested from the single inbox (Message-ID, Sender, Subject, Raw Body, Deduplication Hash, Status: `PENDING`/`PROCESSED`/`SKIPPED`).
- **`email_rules`**: Centralized email filtering rules table (Consolidated from legacy Blacklist & Moneylist):
  - `id`: UUID.
  - `type`: Enum (`blacklist`, `moneylist`, `whitelist`).
    - `blacklist`: Ignore completely, do not send to AI pipeline.
    - `moneylist`: Route to AI pipeline accompanied by a specialized Banking Prompt to extract balance fluctuations.
    - `whitelist`: Analyze with higher processing priority than normal (Priority Queue).
  - `matcher`: Enum (`sender`, `keyword`, `regex`).
  - `match_value`: String (Email address/domain, keyword, or Regex syntax).
  - `description`: Notes for the rule.
  - `is_active`: Rule enable/disable status.
- **`queue_jobs`**: Asynchronous processing status trail logs for the BullMQ worker (Job ID, Retry Count, Payload Snapshot, Error Log).

### 3. Finance & Local Calendar Proxy Schema (`03-finance-calendar-schema.md`)

- **`bank_accounts`**: Bank accounts / e-wallets (Account Name, Bank Code, Account Number, Cached Balance, Currency, Is Active).
- **`transactions`**: Transaction history (Account ID, Category ID, Amount, Type: `INCOME`/`EXPENSE`, Counterparty, Note, Transaction Time, Email Log Reference ID).
- **`categories`**: Income and expense categories (Name, Type, Icon, Budget Limit).
- **`local_calendars`**: Internal proxy calendar (Title, Description, Location, Start/End Time, Attendees JSON, Intent, Priority Status).
- **`calendar_sync_states`**: Sync status with Google Calendar API (Local Event ID, Google Event ID, Sync Status: `SYNCED`/`DIRTY`/`CONFLICT`, Last Synced At, ETag).

### 4. AI Semantic Memory & `pgvector` Schema (`04-ai-memory-pgvector.md`)

- **`ai_memories`**: AI memory store integrated with hybrid search (Hybrid Search):
  - `embedding`: `vector(1536)` indexed using **HNSW Index**.
  - `content_tsv`: `tsvector` for PostgreSQL Full-Text Search.
  - Metadata: Category, Source (`CHAT`/`EMAIL`/`MANUAL`), `initial_score` ($S_0$), `decay_factor` ($\lambda$), `last_accessed_at`.
- **`memory_decay_logs`**: Logs of memory score decay processing according to the formula $S(t) = S_0 \cdot e^{-\lambda t}$.
- **`rag_chunks`**: Temporary text chunking segments before being extracted into formal memory.
