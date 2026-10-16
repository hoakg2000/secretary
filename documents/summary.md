# Secretary — Product summary

A personalized AI assistant for one primary user. The server (NestJS) ingests mail, keeps a finance ledger and a
local calendar, and chats with a configurable character that remembers long-term facts.
Routes are in `api.md`, tables in `db.md`.

Tags: `[Implemented]` = in the code today. `[Planned]` = designed, not built. `[De-scoped]` = decided against for now.

## Change log

| Date | Change |
|------|--------|
| 2026-10-13 | Section C: added chat sessions and message storage and the rule for what becomes a memory. Hybrid memory is no longer described as "self-updating": chat is not written to the vector store unless the AI marks a message important. Memory decay is applied at query time only. Section 2: the stack lines now name what is used (Prisma, Gemini). |
| 2026-10-16 | Rewritten: added a title and a status tag on every feature, checked against `api.md`, `db.md` and the code. De-scoped features are no longer described as built: Telegram quick-action buttons and push notifications, content-based email dedup, the daily time window and 3-hour quiet cron, two-way calendar sync, the mobile app. Chat storage and `characters.memory_rule` are now `[Implemented]`. Decision IDs and links to deleted planning files removed. |
| 2026-10-16 | Review fixes: a duplicate email still `PENDING` is queued again; Google scopes list `userinfo.email`. |

## 1. Core business workflows

### A. Google ecosystem integration (email and calendar)

- **Google OAuth2** `[Implemented]`: tokens stored encrypted, refreshed automatically. Scopes: Gmail
  (`https://mail.google.com/`), Calendar (`https://www.googleapis.com/auth/calendar`) and `https://www.googleapis.com/auth/userinfo.email`.
- **Real-time email ingestion** `[Implemented]`: Gmail Pub/Sub push to `POST /email/pubsub` (Google ID token
  checked; fetches new INBOX mail since the stored history ID), and manual `POST /email/ingest`. Not yet run
  against the real Google services.
- **Queue** `[Implemented]`: BullMQ on Redis; job state lives in Redis.
- **Pre-filtering** `[Implemented]`:
  - Blacklist: saved `SKIPPED`, never sent to the model.
  - MoneyList and whitelist: select a more detailed prompt. Mail that matches no rule is still classified.
- **Deduplication** `[Implemented]`: on `message_id` only; a duplicate that was already processed is ignored (one still `PENDING` is queued again). Hashing `Message-ID` plus body is
  `[De-scoped]`.
- **AI classification** `[Implemented]`: one Gemini call per queued email, no tools.
  - `TRANSACTION`: creates a transaction when exactly one active account matches the extracted account number /
    bank code and currency.
  - `EVENT`: creates a calendar event.
  - Otherwise a short summary, stored in `email_logs.ai_summary`.
  - Urgent mail sends a proactive notification (Telegram text).
- **Email log listing and reprocess** `[Planned]`.
- **Telegram quick-action inline buttons and push notifications** `[De-scoped]`. Telegram text messages only.

### B. Financial ledger and local calendar

- **Multi-account ledger** `[Implemented]`: each account keeps a cached balance, changed only together with a
  transaction row. Totals per currency at `GET /finance/accounts/total-balance`; paginated transaction search.
- **Finance summary route, update of transactions and categories** `[Planned]`. The AI tool `get_financial_summary`
  exists.
- **Local calendar** `[Implemented]`: local is the source of truth; `POST /calendar/sync` and a cron push changes one
  way to Google Calendar.
- **Pull sync from Google and conflict handling** `[De-scoped]`.

### C. Interactive chat and proactive AI agent

- **Interactive chat** `[Implemented]`: SSE stream, Gemini function calling over finance, calendar, memory and
  notification tools. Write tools are not run until the user confirms.
- **Character and persona configuration** `[Implemented]`: system prompt, tone, identity, background, relationship
  dynamics; one active character.
- **Chat sessions and message storage** `[Implemented]`: every session and the full text of every message are stored
  in `chat_sessions` / `chat_messages`. The server supplies the history of a turn. Chat is not embedded and not
  searched by vector.
- **Hybrid long-term memory (`pgvector` + full-text search)** `[Implemented]`: table `ai_memories` (1536-dimension
  embedding); vector cosine similarity combined with `tsvector` search.
  - **What becomes a memory** `[Implemented]`: only a chat message the AI marks as important, by the rule in
    `characters.memory_rule` (built-in default when null). Memories can also be added manually.
  - **Memory decay** `[Implemented]`: `S(t) = S0 · e^(−λt)`, applied when memories are searched. A decay job and
    pruning are `[De-scoped]`.
- **Voice synthesis (TTS)** `[Implemented]`: Fish.audio, MP3 stream with the character's voice.
- **Proactive agent**:
  - Telegram text delivery, `POST /proactive/trigger` `[Implemented]`.
  - Reminder cron for events starting within 15 minutes `[Implemented]`.
  - Instant trigger on urgent mail `[Implemented]`.
  - Daily time-window evaluation and 3-hour quiet cron `[De-scoped]`.

## 2. Tech stack and architecture

- **Backend** `[Implemented]`: NestJS (TypeScript, modular), BullMQ, Prisma.
- **Database** `[Implemented]`: PostgreSQL (relational + `pgvector` + `tsvector`), Redis (queue).
- **Web dashboard** (Next.js, App Router) `[Planned]`: `web-client/` is empty.
- **Mobile app** (React Native) `[De-scoped]`.
- **External integrations** `[Implemented]`: Google APIs (Gmail, Calendar, Pub/Sub), Telegram Bot API, Fish.audio
  TTS, Google Gemini (chat, classification, embeddings).
