# Secretary — Decisions

Build / de-scope decisions from `plan.md` section 2. Other documents cite rows here by ID.

**Status of this file (2026-10-13):** every row carries the plan's recommended default. The owner has not
answered individually; per `plan.md` ("Work proceeds on the default unless the owner says otherwise") the
defaults are in force. Rows marked **Unconfirmed** gate work that has not been started.

**Change log**

| Date | Change |
|------|--------|
| 2026-10-13 | Owner answered D3, D6, D7, D11, D14, D16. D3, D7, D11 and D14 differ from the plan's default. D4 is still unconfirmed. |
| 2026-10-13 | Owner answered D4 and added D17, D18. No row is unconfirmed. |
| 2026-10-13 | Owner added D19 and D20 (chat storage). D19 supersedes D8: chat sessions and full messages are stored in relational tables, not held by the client and not in the vector store. D20: only a message the AI marks important, by the rule configured on the character, becomes a memory in `ai_memories`. Design in `next-steps.md` section 6.4. Not built yet. Two details of D20 are unconfirmed (`next-steps.md` section 2.2). |

| # | Decision | Answer | Confirmed |
|---|----------|--------|-----------|
| D1 | Nested `server/` repository | Flattened into the parent repo (commit `8d85241`). | Done |
| D2 | Routes: docs follow code, or code follows docs | Docs follow code. Routes change in code only where a fix changes them anyway. | Default |
| D3 | Gmail ingestion and AI classification | Build with Gmail Pub/Sub push (no polling cron); one Gemini call per email. | Owner, 2026-10-13 — differs from the plan default (polling) |
| D4 | Telegram and push alerts | Build Telegram text messages only. Push notifications and inline buttons de-scoped for now. | Owner, 2026-10-13 |
| D5 | Two-way calendar sync | Pull sync de-scoped. Local is the source of truth, pushed one way to Google. `POST /calendar/sync` added; immediate sync de-scoped. | Default |
| D6 | Memory decay job, pruning, `memory_decay_logs` | De-scoped. Decay stays at query time. Table to be dropped (task 3.8). | Owner, 2026-10-13 |
| D7 | RAG chunking | Kept. `RagChunkService`, `rag_chunks`, `@langchain/textsplitters` stay, unused, marked with a comment (task 3.8). | Owner, 2026-10-13 — differs from the plan default (delete) |
| D8 | Chat session state | Build, reduced: the client sends recent turns; the server retrieves memories before the turn. No session table. | Default — **superseded by D19** (still what the code does until task 6.4 is built) |
| D9 | Proactive triggers | Reminder cron only. Daily window, quiet cron and context evaluation de-scoped. | Default |
| D10 | Web and mobile clients | Planned. Out of scope. | Default |
| D11 | `queue_jobs` table | Kept, unused (BullMQ keeps job state in Redis), marked with a comment (task 3.8). | Owner, 2026-10-13 — differs from the plan default (drop) |
| D12 | Content-based email dedup (`dedup_hash`) | Column dropped; dedupe on `message_id` only. | Default |
| D13 | Embedding model | `gemini-embedding-001` at 1536 dimensions, name in `GEMINI_EMBEDDING_MODEL`. | Default — availability not yet checked against the API |
| D14 | `user_sessions.device_id` | Kept for future multi-user / multi-device support. Never written today; marked with a comment (task 3.8). | Owner, 2026-10-13 — differs from the plan default (drop) |
| D15 | Document language | English for `documents/`; Vietnamese Swagger strings and log messages stay. | Default |
| D16 | Is the GitHub repository public? | Private. The database password in `server/docker-compose.yml` is an example value, not a production secret; pushing is allowed. | Owner, 2026-10-13 |
| D17 | Response interceptor (rest of plan task 5.2) | Backlog. Handlers keep building `{ statusCode, message, data }` by hand. | Owner, 2026-10-13 |
| D18 | AI classification of mail that matches no rule | Classified. Only blacklist is skipped. No rule: the model decides the category. A matched rule (moneylist / whitelist) selects a more detailed prompt. | Owner, 2026-10-13 |
| D19 | Where chat sessions, messages and history are stored | In Postgres relational tables `chat_sessions` and `chat_messages`, holding the full text of every message. They are never embedded and never searched by vector: no `vector` column, nothing copied to `ai_memories` by default. The server, not the client, supplies the history of a turn. Supersedes D8. | Owner, 2026-10-13 |
| D20 | Which chat content becomes long-term memory | Only a message the AI agent marks as important. The agent decides by a rule in the system prompt; the rule is configured per character (in the character table, form to be settled). Only those messages are written to `ai_memories` (embedding + text search) for later recall. | Owner, 2026-10-13 — where the rule is stored and what text is embedded are unconfirmed (`next-steps.md` section 2.2) |
