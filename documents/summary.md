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
- **Self-Updating Hybrid Memory (`pgvector` + FTS):**
  - PostgreSQL + `pgvector` extension.
  - **Hybrid Search:** Combine Vector Cosine Similarity (semantic search) with PostgreSQL Full-Text Search (`tsvector` for exact keyword/code matching).
  - **Memory Decay:** Apply exponential decay formula $S(t) = S_0 \cdot e^{-\lambda t}$ to prioritize recent relevant memories over legacy data.
- **Voice Synthesis (TTS):** Integration with Fish.audio API for low-latency streaming TTS matching the configured Persona voice.
- **Proactive AI Agent (Event-driven & Hybrid Trigger):**
  - **Instant Trigger:** Executed on urgent emails, high-priority calendar events, or incoming webhooks.
  - **Fixed Time Window Trigger:** Daily scheduled evaluation (e.g., 5:20 PM) where the agent assesses recent context and autonomously decides whether to initiate a conversation.
  - **Fallback Trigger (3-hour Quiet Cron):** Runs every 3 hours **only** if zero activity (no emails, no chats, no DB mutations) occurred during that time window.

### 2. Tech Stack & System Architecture

- **Backend:** NestJS (TypeScript, Modular Architecture, BullMQ, Prisma/TypeORM).
- **Database:** PostgreSQL (Relational + `pgvector` + `tsvector`), Redis (Caching & Queue).
- **Frontend:** Next.js 14+ (App Router, Web Dashboard), React Native (Mobile App).
- **External Integrations:** Google APIs (Gmail, Calendar, Pub/Sub), Telegram Bot API, Fish.audio TTS API, OpenAI / Anthropic LLM APIs.
