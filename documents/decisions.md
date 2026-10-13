# Secretary — Decisions

Build / de-scope decisions from `plan.md` section 2. Other documents cite rows here by ID.

**Status of this file (2026-10-13):** every row carries the plan's recommended default. The owner has not
answered individually; per `plan.md` ("Work proceeds on the default unless the owner says otherwise") the
defaults are in force. Rows marked **Unconfirmed** gate work that has not been started.

| # | Decision | Answer | Confirmed |
|---|----------|--------|-----------|
| D1 | Nested `server/` repository | Flattened into the parent repo (commit `8d85241`). | Done |
| D2 | Routes: docs follow code, or code follows docs | Docs follow code. Routes change in code only where a fix changes them anyway. | Default |
| D3 | Gmail ingestion and AI classification | Build, reduced: poll Gmail on a cron; one Gemini call per email. Pub/Sub push is Planned. | **Unconfirmed** — gates Phase 6 |
| D4 | Telegram and push alerts | Build Telegram text messages only. Push notifications and inline buttons de-scoped. | **Unconfirmed** — gates Phase 6 |
| D5 | Two-way calendar sync | Pull sync de-scoped. Local is the source of truth, pushed one way to Google. `POST /calendar/sync` added; immediate sync de-scoped. | Default |
| D6 | Memory decay job, pruning, `memory_decay_logs` | De-scoped. Decay stays at query time. Table to be dropped. | **Unconfirmed** — gates task 3.8 |
| D7 | RAG chunking | De-scoped. `RagChunkService`, `rag_chunks`, `@langchain/textsplitters` to be deleted. | **Unconfirmed** — gates task 3.8 |
| D8 | Chat session state | Build, reduced: the client sends recent turns; the server retrieves memories before the turn. No session table. | Default |
| D9 | Proactive triggers | Reminder cron only. Daily window, quiet cron and context evaluation de-scoped. | Default |
| D10 | Web and mobile clients | Planned. Out of scope. | Default |
| D11 | `queue_jobs` table | To be dropped; BullMQ keeps job state in Redis. | **Unconfirmed** — gates task 3.8 |
| D12 | Content-based email dedup (`dedup_hash`) | Column dropped; dedupe on `message_id` only. | Default |
| D13 | Embedding model | `gemini-embedding-001` at 1536 dimensions, name in `GEMINI_EMBEDDING_MODEL`. | Default — availability not yet checked against the API |
| D14 | `user_sessions.device_id`, `LoginDto.deviceId` | To be dropped from docs and schema. | **Unconfirmed** — gates task 3.8 |
| D15 | Document language | English for `documents/`; Vietnamese Swagger strings and log messages stay. | Default |
| D16 | Is the GitHub repository public? | Not answered. Nothing is pushed until it is. `server/docker-compose.yml` holds a development database password. | **Unconfirmed** — gates any push |
