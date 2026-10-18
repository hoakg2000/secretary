# Secretary — Product summary

A personalized AI assistant for one primary user. The server (NestJS) ingests mail, keeps a finance ledger and a
local calendar, and chats with a configurable character that remembers long-term facts.
Routes are in `api.md`, tables in `db.md`. This file describes what the code does today. What is not built is listed
in section 3.

## 1. Core business workflows

### A. Google ecosystem integration (email and calendar)

- **Google OAuth2**: tokens stored encrypted, refreshed automatically. Scopes: Gmail
  (`https://mail.google.com/`), Calendar (`https://www.googleapis.com/auth/calendar`) and `https://www.googleapis.com/auth/userinfo.email`.
- **Real-time email ingestion**: Gmail Pub/Sub push to `POST /email/pubsub` (Google ID token
  checked; fetches new INBOX mail since the stored history ID), and manual `POST /email/ingest`. Not yet run
  against the real Google services.
- **Queue**: BullMQ on Redis; job state lives in Redis.
- **Pre-filtering**:
  - Blacklist: saved `SKIPPED`, never sent to the model.
  - MoneyList and whitelist: select a more detailed prompt. Mail that matches no rule is still classified.
- **Deduplication**: on `message_id` only; a duplicate that was already processed is ignored (one still `PENDING` is
  queued again).
- **AI classification**: one LLM call (`LlmService`) per queued email, no tools.
  - `TRANSACTION`: creates a transaction when exactly one active account matches the extracted account number
    and/or bank code (and the currency, when the model extracted one).
  - `EVENT`: creates a calendar event.
  - Otherwise a short summary, stored in `email_logs.ai_summary`.
  - Urgent mail sends a proactive notification (Telegram text).
- **Email logs**: `GET /email/logs` lists them; `POST /email/logs/:id/reprocess` queues a `FAILED` one again.

### B. Financial ledger and local calendar

- **Multi-account ledger**: each account keeps a cached balance, changed only together with a
  transaction row. Totals per currency at `GET /finance/accounts/total-balance`; paginated transaction search;
  transactions and categories can be edited; income and expense per currency at `GET /finance/summary`.
  The AI tool `get_financial_summary` returns the totals and the active accounts.
- **Local calendar**: local is the source of truth; `POST /calendar/sync` and a cron push changes one
  way to Google Calendar.

### C. Interactive chat and proactive AI agent

- **Interactive chat**: SSE stream, LLM function calling over finance, calendar, memory and
  notification tools. Write tools are not run until the user confirms.
- **Character configuration**: one `system_prompt` text per character (identity, tone, background,
  rules), added to the default prompt. Characters are loaded from `documents/characters/*.json` by `npm run seed`. There can be many characters; the client chooses one. A new chat session requires a `characterId` and
  keeps it; an existing session uses its stored character.
- **Bilingual reply**: the model answers in JSON with a Vietnamese text (shown, streamed) and a Japanese text (stored, read by TTS). Chat model: through `LlmService`, MộtAPI `claude-sonnet-5-5` by default; the provider is switched in `server/src/llm/llm.service.ts` (`LLM_TYPE`).
- **Chat sessions and message storage**: every session and the full text of every message are stored
  in `chat_sessions` / `chat_messages`. The server supplies the history of a turn. Chat is not embedded and not
  searched by vector.
- **Hybrid long-term memory (`pgvector` + full-text search)**: table `ai_memories` (1536-dimension
  embedding); vector cosine similarity combined with `tsvector` search.
  - **What becomes a memory**: only a chat message the AI marks as important, by the rule in
    `characters.memory_rule` (built-in default when null). Memories can also be added and edited manually.
  - **Memory decay**: `S(t) = S0 · e^(−λt)`, applied when memories are searched.
- **Voice synthesis (TTS)**: Fish.audio, MP3 stream. The request sends a chat `messageId`; the server speaks that
  message's Japanese text (`content_jp`) with the `voice_id` of the character of the message's session.
- **Proactive agent**:
  - Telegram text delivery, `POST /proactive/trigger`.
  - Reminder cron for events starting within 15 minutes.
  - Instant trigger on urgent mail.

## 2. Tech stack and architecture

- **Backend**: NestJS (TypeScript, modular), BullMQ, Prisma.
- **Database**: PostgreSQL (relational + `pgvector` + `tsvector`), Redis (queue).
- **External integrations**: Google APIs (Gmail, Calendar, Pub/Sub), Telegram Bot API, Fish.audio
  TTS, MộtAPI (chat and email classification by default), Google Gemini (embeddings; chat and classification when
  `LLM_TYPE` is `gemini`).
- **Web client**: `web-client/`, Next.js 16 (App Router), Vietnamese and English. Pages: login, chat, dashboard,
  characters, emails, calendar, finance, memories, settings (Google connect and disconnect). It calls the API at
  `NEXT_PUBLIC_API_URL`.
- **Repository folders**: `server/` and `web-client/` are the product. `mobile-client/` is empty. Two
  prototypes sit outside the product and are not used by the server: `fish-tts-api/` (a standalone Express proxy,
  `POST /api/tts`, that calls Fish.audio with a fixed `MODEL_ID`) and `src/` (a static page `index.html` that calls
  that proxy on `localhost:3000`, a `requirements.txt` of Python voice libraries, and a sample `output_voice.wav`).

## 3. Not built

### Dropped

- Content-based email deduplication (hash of `Message-ID` plus body).
- Telegram quick-action inline buttons and push notifications. Text messages only.
- Daily time-window evaluation and the 3-hour quiet cron. `INACTIVITY_FALLBACK` is only a label a caller can send.
- Pull sync from Google Calendar and conflict handling (`CONFLICT` exists in `SyncStatus`, nothing sets it).
- Memory decay job, pruning of memories and a decay log (`memory_decay_logs`).
- Mobile app (React Native).
