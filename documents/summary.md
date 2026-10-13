## Change log

| Date | Change |
|------|--------|
| 2026-10-13 | Section C: added "Chat sessions and message storage" (D19) and the rule for what becomes a memory (D20); both planned, task 6.4. Hybrid memory is no longer described as "self-updating": chat is not written to the vector store unless the AI marks a message important. Memory decay is applied at query time only (D6). Section 2: the stack lines now name what is used (Prisma, Gemini). The rest of this file is not yet revised and still describes planned features as if built; the full rewrite is `next-steps.md` section 5.2. |

## I. Project Description & Core Business Workflows

The system is a **Personalized AI Assistant**, customized according to user settings and operating synchronously across a Web Dashboard (Next.js) and Mobile App (React Native) for a primary single user with multi-platform synchronization.

### 1. Core Business Workflows

#### A. Google Ecosystem Integration (Email & Calendar)

- **Integration Method:** Google OAuth2 with automatic Token Refresh mechanism & Google Pub/Sub Webhooks for real-time email ingestion.
- **Google OAuth Scopes:** Scopes covering both Gmail API (`https://mail.google.com/`) and Google Calendar API (`https://www.googleapis.com/auth/calendar`).
- **Email Flow:** Automatic ingestion of forwarded emails from multiple secondary addresses into the primary inbox.
- **Pre-filtering & Async Processing Pipeline:**
  - **Architecture:** State Machine + Redis Queue (BullMQ in NestJS).
  - **Pre-filtering Engine:**
    - **Blacklist:** Immediate bypass; skips AI pipeline completely.
    - **MoneyList:** Fast-track identification of bank and e-wallet notification formats.
    - _Note:_ Pre-filtering optimizes token usage and routes payloads before passing to the LLM.
  - **Deduplication & Idempotency:** Hash `Message-ID` + Body payload to guarantee zero duplicate financial or calendar entries upon worker retries.
- **AI Analysis & Classification Pipeline:**
  - **Category 1 — Balance Fluctuation:** Extract amount, transaction type (income/expense), counterparty, and bank account/wallet ID. Update financial tables atomically.
  - **Category 2 — Schedules & Appointments:** Extract start/end time, location, attendees, and intent. Synchronize automatically with Google Calendar API.
  - **Category 3 — General/Others:** Summarize content into short structured highlights.
  - **Emergency Alert Mechanism:** High-priority or urgent emails trigger instant real-time push notifications via Telegram Bot API with quick-action inline buttons.

#### B. Financial Ledger & Local Calendar Rules

- **Multi-Account Financial Ledger:**
  - Each bank or wallet account maintains a real-time balance cache for instant inspection without requiring runtime aggregations.
  - An aggregated **Total Account** balance is maintained at top-level, with individual bank/wallet breakdowns accessible via drill-down ("See More").
- **Local Calendar Proxy:**
  - Maintains a local database calendar with a background sync engine to write and log changes locally before propagating to the Google Calendar API, minimizing external rate limits and latency.

#### C. Interactive Chatbox & Proactive AI Agent

- **Interactive Chat:** Support conversational interactions, real-time schedule queries, and financial summaries.
- **Persona & Character Configuration:** Customizable system prompts, tone, background context, and relationship dynamics.
- **Chat Sessions & Message Storage** `[Planned]` (D19, task 6.4):
  - Every chat session and the full text of every message, sent by the user or received from the model, is stored in relational tables (`chat_sessions`, `chat_messages`). The server supplies the history of a turn.
  - Chat sessions, messages and history are **not** stored in the vector database: no embedding per message.
  - Today (before task 6.4) the server stores no chat; the client keeps the conversation and sends the recent turns with each request.
- **Hybrid Long-Term Memory (`pgvector` + FTS)** `[Implemented]`:
  - PostgreSQL + `pgvector` extension, table `ai_memories` (1536-dimension embedding).
  - **What becomes a memory** `[Planned]` (D20): only a chat message the AI agent marks as important. The agent decides by a rule in its system prompt; the rule is configured per character. Everything else stays in the chat tables only. Memories can also be added manually.
  - **Hybrid Search:** Combine Vector Cosine Similarity (semantic search) with PostgreSQL Full-Text Search (`tsvector` for exact keyword/code matching).
  - **Memory Decay:** Exponential decay $S(t) = S_0 \cdot e^{-\lambda t}$, applied when memories are searched, to prioritize recent relevant memories. There is no decay job (D6).
- **Voice Synthesis (TTS):** Integration with Fish.audio API for low-latency streaming TTS matching the configured Persona voice.
- **Proactive AI Agent (Event-driven & Hybrid Trigger):**
  - **Instant Trigger:** Executed on urgent emails, high-priority calendar events, or incoming webhooks.
  - **Fixed Time Window Trigger:** Daily scheduled evaluation (e.g., 5:20 PM) where the agent assesses recent context and autonomously decides whether to initiate a conversation.
  - **Fallback Trigger (3-hour Quiet Cron):** Runs every 3 hours **only** if zero activity (no emails, no chats, no DB mutations) occurred during that time window.

### 2. Tech Stack & System Architecture

- **Backend:** NestJS (TypeScript, Modular Architecture, BullMQ, Prisma).
- **Database:** PostgreSQL (Relational + `pgvector` + `tsvector`), Redis (Caching & Queue).
- **Frontend:** Next.js 14+ (App Router, Web Dashboard), React Native (Mobile App).
- **External Integrations:** Google APIs (Gmail, Calendar, Pub/Sub), Telegram Bot API, Fish.audio TTS API, Google Gemini API (chat, classification, embeddings).
