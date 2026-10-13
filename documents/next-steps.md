# Secretary — What to do next

Written 2026-10-13. Read this together with `plan.md` (task definitions, risks R1–R10), `report.md` (issue IDs)
and `decisions.md` (owner decisions D1–D16). Task numbers below are the ones in `plan.md`.

Everything listed here is still open. Section numbers are stable references, not the work order.

**Work order** (owner, 2026-10-13: finish the server code first, integrate with real services afterwards):

1. Section 3 — task 3.8.
2. Section 6 — features 6.1, 6.2, 6.3, 6.4, each proven by unit tests with stubbed external clients.
3. Section 4 — remaining hardening (4.2, 4.3).
4. Section 5 — documentation, written from the finished code.
5. Section 1 — integration: first run against real services, manual checks, unchecked assumptions.
6. Section 8 — finishing.

## Change log

| Date | Change |
|------|--------|
| 2026-10-13 | First version. |
| 2026-10-13 | Owner answered D16, D6, D7, D11, D14, D3 (section 2). D16: repository is private, push allowed. Task 3.8 reduced to dropping `memory_decay_logs` only; RAG chunking, `queue_jobs` and `user_sessions.device_id` stay and get a comment (section 3). Task 6.2 changed from Gmail polling to Gmail Pub/Sub push (section 6.2); Pub/Sub removed from the backlog. Sections 0, 5.2–5.5 and 8 adjusted to match. Still open: D4 and the response interceptor. `plan.md` is not edited: its rows D3, D6, D7, D11, D14, D16 and tasks 3.8 and 6.2 are superseded by this file and `decisions.md`. |
| 2026-10-13 | Owner answered the remaining decisions (section 2): D4 Telegram text only; response interceptor moved to the backlog (D17); mail that matches no rule is classified by the AI, only blacklist is skipped, a matched rule selects a more detailed prompt (D18, section 6.3). Work order changed: code first, integration (section 1) after sections 3–6; the environment is already set up and the owner runs it when needed. No decision is open. |
| 2026-10-13 | Owner added D19 and D20 (chat storage). New task 6.4: tables `chat_sessions` and `chat_messages` store every chat message in full; chat is never stored in the vector store; only a message the AI marks important, by the rule configured on the character, is written to `ai_memories`. D8 (client-held history, no session table) is superseded. "Server-side chat sessions" removed from the backlog (section 7). Sections 1.4, 2, 5.2–5.5 adjusted to match. Two details of D20 are open (section 2.2). `plan.md` is not edited: its row D8 is superseded by this file and `decisions.md`. |
| 2026-10-13 | On the owner's request the existing documents were updated in place for D19 / D20, each with its own change log: `db.md` (rewritten from the schema, new section 5 "Chat"), `modules/ai/ai.controller.md` and `modules/ai/ai.service.md` (rewritten from the code, chat storage marked `[Planned]`), `modules/ai/ai-flow.mermaid.live`, `api.md` (change log, "Chat storage" section), `summary.md` (section C). Sections 5.3–5.5 still apply: `db.md` is to become `database.md`, the two module files `modules/ai-agent.md`, and the flow `flows/ai-agent.mmd`; their content can now be moved rather than rewritten. |

---

## 0. Starting point and working rules

- **Branch:** `refactor/plan-phase-0-3`. It is local only. `main` does not contain the work. Pushing is allowed
  (D16: the repository is private).
- **Run everything from `server/`.** Gate for every commit: `npx tsc --noEmit` and `npm test` both pass.
  `npx nest build` must also pass before a merge.
- **One task, one commit**, message ending with the plan task number, e.g. `... (plan 3.8)`.
- **A commit that changes a route, an environment variable, a table or an AI tool also changes the matching document**
  (`api.md`, `environment.md`, `server/.env.example`, and `database.md` once it exists).
- **No database has ever been migrated with the current migrations and the server has never been started with the
  current code.** Type check, build and unit tests are the only evidence until section 1 is run. Until then every
  task is verified by unit tests with stubbed Google, Gemini, Telegram and Gmail clients; checks that need a real
  service are collected in section 1.4.
- **The environment is already set up by the owner**, who starts it when needed. Do not block code work on it.
- **Creating a migration** (needs a running Postgres with the earlier migrations applied — ask the owner to start
  it; if it is not available, hand-write the SQL in a new migration folder as the seven `20261013…` migrations
  were, and list it in section 1.4 as unverified):
  1. Edit `server/prisma/schema.prisma`.
  2. `npx prisma migrate dev --create-only --name <name>`.
  3. **Read the generated SQL.** Three indexes exist only in hand-written migrations and are unknown to
     `schema.prisma`: `characters_single_active`, `ai_memories_embedding_hnsw`, `ai_memories_content_tsv_gin`.
     Prisma will probably generate `DROP INDEX` for them. Delete those statements from the new migration.
  4. `npx prisma migrate dev` to apply, then `npx prisma generate`.
- **Source files use CRLF line endings; the repository normalises to LF.** Multi-line `sed`/script replacements that
  assume `\n` silently fail. Use an editor.
- **Tests:** unit tests construct the service directly with hand-written mock objects (see
  `server/src/finance/finance.service.spec.ts`). Add `import 'reflect-metadata';` as the first line of a spec that
  uses `class-transformer` / `class-validator` without importing Nest. `server/test/app.e2e-spec.ts` needs a real
  database and Redis and is not part of `npm test`.

---

## 1. Integration: first run against real services (after sections 3–6)

The owner runs this when the server code is complete. Expect fixes here: nothing below has been observed yet.

### 1.1 Bring the stack up

1. Start Docker Desktop, then in `server/`: `docker compose up -d`.
2. `npm install`.
3. Check `server/.env` against `server/.env.example`. Required: `DATABASE_URL`, `JWT_SECRET` (≥ 32 chars),
   `JWT_REFRESH_SECRET` (≥ 32 chars), `REDIS_HOST`, `REDIS_PORT`. `TOKEN_ENCRYPTION_KEY` (32 bytes, base64) is
   required when `GOOGLE_CLIENT_ID` is set. Add `MASTER_EMAIL`, `MASTER_PASSWORD`. Add `GEMINI_API_KEY` to test chat
   and memory, `FISH_AUDIO_API_KEY` to test TTS.
4. If the database already holds data from before 2026-10-13: take a `pg_dump`, then follow
   "Upgrading a database created before 2026-10-13" in `setup.md` (duplicate `email_log_id` check; clear the plaintext
   Google tokens).
5. `npx prisma migrate deploy`. Seven migrations dated `20261013…` apply:
   `auth_refresh_session`, `character_single_active`, `finance_integrity`, `email_drop_dedup_hash`,
   `calendar_soft_delete_reminder`, `ai_memory_indexes`, `add_indexes`.
   If one fails, fix the SQL in that migration folder (they were generated or written without a database) and
   record the fix in the commit message.
6. `npm run seed` (runs `node prisma/seed.ts` through Node's type stripping). If Node refuses the file, add `tsx` as
   a dev dependency and change `seed` in `server/prisma.config.ts` to `tsx prisma/seed.ts`.
7. `npm run start:dev`. A missing or invalid variable stops the process with a message that names the key.
8. Once the server runs with the new secrets, delete `server/.env.bak-20261013` (old secrets, ignored by git).

### 1.2 Manual checks

Use Swagger at `http://localhost:3000/api/docs` or `curl`. Routes and frame formats are in `api.md`.
Fix whatever fails before moving on; add a unit test for each fix where one is practical.

| # | Check | Expected |
|---|-------|----------|
| 1 | `GET /api/docs` in a browser | Swagger UI renders and "Try it out" works. **Risk:** `helmet()` in `server/src/main.ts` sets a Content-Security-Policy that may block Swagger UI. If it does, pass `helmet({ contentSecurityPolicy: false })` only when `NODE_ENV !== 'production'`, or allow what Swagger needs. |
| 2 | `POST /api/v1/auth/login` with the seeded user | 200, `accessToken`, `Set-Cookie: refreshToken` with path `/api/v1/auth` |
| 3 | Sixth login within one minute | 429 |
| 4 | `GET /api/v1/characters` without a token | 401 |
| 5 | `GET /api/v1/auth/session` using the refresh token as bearer | 401 |
| 6 | `POST /api/v1/auth/refresh` twice with the same refresh token | First 200 with a new token; second 401; the token returned by the first call is then also rejected |
| 7 | Log in twice, log out of one session | The other session still refreshes; the logged-out access token gets 401 |
| 8 | `GET /api/v1/auth/google/callback?code=x` (no `state`) | 400 |
| 9 | Start the server, watch the log for one calendar-sync tick | `Bắt đầu Cronjob đồng bộ Google Calendar...` appears **once** per interval, not twice |
| 10 | Create two characters, activate each in turn | `SELECT count(*) FROM characters WHERE is_active;` is 1 |
| 11 | `PATCH /api/v1/characters/<A>/personas/<persona of B>` | 404 |
| 12 | 20 concurrent `POST /api/v1/finance/transactions` of 1.00 on one account | Balance changes by exactly 20.00 |
| 13 | `PATCH /api/v1/finance/accounts/:id` with `cachedBalance` in the body | Balance unchanged |
| 14 | `PATCH /api/v1/finance/accounts/:id/balance` | Balance equals `newBalance`; one new transaction equal to the difference |
| 15 | EXPENSE transaction with an INCOME category | 400 |
| 16 | Delete an account that has transactions | 200, returned with `isActive: false`, row still exists |
| 17 | `POST /api/v1/email/ingest` twice with the same `messageId`, concurrently | Two 200 responses, one row in `email_logs` |
| 18 | Ingest an email matching a blacklist rule | Row has status `SKIPPED`; no job in Redis |
| 19 | Ingest an email matching a moneylist rule | Job runs; row becomes `PROCESSED` |
| 20 | `PATCH /api/v1/email-rules/:id { "isActive": false }` | Persisted |
| 21 | `POST /api/v1/ai-agent/memories` (needs `GEMINI_API_KEY`) | 201; `SELECT embedding IS NOT NULL FROM ai_memories` is true. **Do the model check in 1.3 first.** |
| 22 | `\d ai_memories` in `psql` | Shows `ai_memories_embedding_hnsw` and `ai_memories_content_tsv_gin` |
| 23 | Memory search with a query unrelated to every stored memory | `[]`, and no `last_accessed_at` changes |
| 24 | `curl -N -X POST -H "Authorization: Bearer …" -H "Content-Type: application/json" -d '{"message":"xin chào"}' http://localhost:3000/api/v1/ai-agent/chat/stream` | Several `data:` frames, the last `{"type":"done"}` |
| 25 | Chat: send "Tên tôi là Hoa", then a second request with that turn in `history` asking "Tên tôi là gì?" | The answer contains the name |
| 26 | Chat: ask it to record an expense | A `confirmation_required` frame; no transaction until `POST /api/v1/ai-agent/actions/:actionId/confirm`; a second confirm → 404 |
| 27 | `POST /api/v1/ai-agent/tts` without `FISH_AUDIO_API_KEY` | 503 |
| 28 | `POST /api/v1/proactive/trigger` | `data.result.status` is `LOGGED`, `data.success` is `false` |
| 29 | Create an event starting in 10 minutes, wait for two reminder cron runs (every 10 minutes) | One reminder log line, `reminded_at` set |

Google checks (need a Google Cloud OAuth client and a connected account):

| # | Check | Expected |
|---|-------|----------|
| 30 | `GET /api/v1/auth/google/connect`, open the URL, approve | Callback returns 200; `SELECT google_refresh_token FROM users` starts with `v1:` |
| 31 | Create a local event, `POST /api/v1/calendar/sync` | `{ pushed: 1, … }`; the event appears in Google Calendar; `calendar_sync_states.google_event_id` equals the local UUID without dashes |
| 32 | Edit the event locally, sync | Google event updated; attendees added on the Google side survive |
| 33 | Delete the event locally, sync | Removed from Google; local row gone |
| 34 | Delete an event in Google, then edit it locally and sync | Result counts it under `removedRemotely`; it is not retried on the next run |
| 35 | Leave the server running for more than an hour, sync again | Works; `users.google_token_expires_at` has moved forward (refreshed token persisted) |

### 1.3 Assumptions that were never checked against the real API

Each of these is a code path that may need changing once observed.

1. **Embedding model.** `server/src/ai-agent/services/memory/memory.service.ts` calls `embedContent` with
   `GEMINI_EMBEDDING_MODEL` (default `gemini-embedding-001`), `outputDimensionality: 1536` and a `taskType`, and
   throws unless exactly 1536 values come back. Call it once with a real key. If the model is unavailable, pick the
   current embedding model from Google's model list that supports 1536 dimensions, set it in `.env`, and update the
   default in `memory.service.ts`, `.env.example`, `environment.md` and row D13 of `decisions.md`.
   The column stays `vector(1536)` (plan risk R4).
2. **`minScore` default 0.5** (`memory.service.ts`, `searchMemory`). Untuned. With a handful of real memories, look
   at the `similarity` values for related and unrelated queries and set the default between them.
3. **Google Calendar client-supplied event IDs.** `server/src/calendar/calendar-sync.service.ts` sends
   `id = <uuid without dashes>` on insert and treats HTTP 409 as "already created, continue with `events.patch`".
   Confirm both in the Calendar API reference and with check 31. Also confirm what `events.patch` returns for an
   event deleted on Google (the code expects 404 or 410).
4. **Gemini and several function calls in one turn.** `server/src/ai-agent/services/agent/agent.service.ts` answers
   all calls of a turn in one message, each `functionResponse` carrying the call's `id` and `name`. Ask a question
   that needs two tools (for example balance and today's events) and confirm no API error.
5. **Chat model name** `gemini-2.5-flash` is a constant (`CHAT_MODEL`) in `agent.service.ts`. Confirm it is still
   served; if not, move it to an environment variable the same way as the embedding model.
6. **`@nestjs/throttler` 6.x with Nest 12** — installed without a peer warning, never exercised (check 3).

### 1.4 Checks deferred from sections 3 and 6

Add a line here for every hand-written migration and every assumption about an external API made while coding.

| From | Check | Expected |
|------|-------|----------|
| 3.8 | `npx prisma migrate deploy` applies `drop_memory_decay_logs` | `memory_decay_logs` gone; the three hand-written indexes still exist (check 22) |
| 6.1 | `POST /api/v1/proactive/trigger` with a real `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` | Message arrives; status `SENT` |
| 6.2 | Public HTTPS URL, topic, push subscription; connect Google; send a mail to the inbox | `users.watch` succeeds; one push arrives; one row in `email_logs`; a request without a valid Google token gets 401 |
| 6.3 | Real bank notification, real meeting invitation, mail matching no rule, mail matching a blacklist rule | One transaction; one event; a category and `ai_summary` chosen by the model; `SKIPPED` with no model call |
| 6.2 | `npx prisma migrate deploy` applies `user_gmail_history_id` (hand-written) | `users.gmail_history_id` exists |
| 6.2 | `users.history.list` and `users.messages.list` are called with the `INBOX` label filter (`gmail-push.service.ts`) | Only received mail is ingested, not sent mail or drafts |
| 6.2 | `verifyIdToken` of `google.auth.OAuth2` accepts a real Pub/Sub push token | 200 for the real subscription; payload has `email` and `email_verified` |
| 6.3 | `npx prisma migrate deploy` applies `email_ai_summary` (hand-written) | `email_logs.ai_summary` exists |
| 6.4 | `npx prisma migrate deploy` applies `chat_sessions_messages` | Tables `chat_sessions`, `chat_messages` and column `characters.memory_rule` exist; neither chat table has a `vector` column |
| 6.4 | Chat "Tên tôi là Hoa", then a second request with only the returned `sessionId` asking "Tên tôi là gì?" | The answer contains the name (replaces check 25 of section 1.2); one row in `chat_sessions`, four rows in `chat_messages` |
| 6.4 | Chat one small-talk message and one message the rule calls important | `ai_memories` gains exactly one row; that message's `memory_id` is set, the other is null |
| 6.3 | Gemini accepts the `responseSchema` in `email-ai.service.ts` (`nullable` objects, `enum`) with `gemini-2.5-flash` | JSON answer, no API error |
| 6.3 | The model's `bankCode` equals the stored `bank_accounts.bank_code` (case-insensitive exact match); banks mask account numbers | A real notice finds its account. If not, pass the owner's accounts into the prompt or match on a suffix |

---

## 2. Owner decisions

### 2.1 Answered (2026-10-13)

Recorded in `decisions.md`.

| Decision | Question | Answer | Effect |
|----------|----------|--------|--------|
| D16 | Is the GitHub repository public? | Private. The database password in `server/docker-compose.yml` is an example value, not a production secret, and may be pushed. | `git push` is allowed. |
| D6 | Drop the memory decay job and the `memory_decay_logs` table? | Drop. | Task 3.8. |
| D7 | Delete RAG chunking (`RagChunkService`, `rag_chunks`, `@langchain/textsplitters`)? | Keep, with a comment. | Not deleted; comment added in task 3.8. |
| D11 | Drop the `queue_jobs` table? | Keep, with a comment. | Not dropped; comment added in task 3.8. |
| D14 | Drop `user_sessions.device_id`? | Keep, with a comment. Needed for future multi-user support. | Not dropped; comment added in task 3.8. |
| D3 | Gmail polling instead of Pub/Sub? | Keep Pub/Sub. | Task 6.2 builds the Pub/Sub push receiver, not a polling cron. The one-call AI classification of task 6.3 is unchanged. |

| D4 | Telegram text delivery only (no push, no inline buttons)? | Yes, text only for now. | Task 6.1 as written. |
| D17 | Is the response interceptor of task 5.2 wanted? | Later. Backlog. | Section 4.1 is not scheduled; listed in section 7. |
| D18 | Should mail that matches no rule be classified by the AI? | Yes. Only blacklist is skipped. No rule: the AI decides. A matched rule: a more detailed prompt. | Task 6.3. |

| D19 | Where are chat sessions, messages and history stored? | In relational tables, full message text. Not in the vector store. Supersedes D8. | Task 6.4. |
| D20 | Which chat content becomes long-term memory? | Only a message the AI marks important, by a system-prompt rule configured on the character. | Task 6.4. |

### 2.2 Still open

Both gate only the memory part of task 6.4 (section 6.4, "Important messages"). The tables and routes do not wait
for them. Each has a proposed default, used if the owner does not answer.

| # | Question | Proposed default |
|---|----------|------------------|
| D20-a | Where on the character is the importance rule stored: a column `characters.memory_rule`, or a new `PersonaType` value (`MEMORY_RULE`) in `personas`? | Column `characters.memory_rule` (`String? @db.Text`): one rule per character, and the owner said "character table". |
| D20-b | What text is embedded: the user's message verbatim, or the sentence the AI writes when it marks the message (today's `save_user_memory` `content` argument)? | The AI's sentence, linked to the original message by `chat_messages.memory_id`. The full message stays readable in `chat_messages`. |

A new question raised while coding is added here and to `decisions.md` before the work it gates.

---

## 3. Task 3.8 — drop `memory_decay_logs`, comment the kept items

Decisions D6 (drop), D7, D11, D14 (keep with a comment). Destructive: take a `pg_dump` first (plan risk R6).

### 3.1 Drop the decay log (D6)

1. Confirm the table is empty: `SELECT count(*) FROM memory_decay_logs;`
   If it is not zero, stop and ask the owner.
2. `server/prisma/schema.prisma`: delete the model `MemoryDecayLog` and the line `decayLogs MemoryDecayLog[]` from
   `AiMemory`.
3. Migration `drop_memory_decay_logs` (workflow in section 0). Expected SQL: the foreign key drop and one
   `DROP TABLE "memory_decay_logs"`. Nothing else — in particular no `DROP INDEX` on the three hand-written
   indexes, and no change to `rag_chunks`, `queue_jobs` or `user_sessions`.
4. Verify: `grep -ri "MemoryDecayLog\|memory_decay_logs" server/src server/prisma/schema.prisma` prints nothing;
   `npx tsc --noEmit`, `npm test`, `npx nest build` pass.

Query-time decay in `memory.service.ts` is not touched.

### 3.2 Comment the kept items (D7, D11, D14)

No behaviour change and no migration. One comment each, at the declaration:

| Item | Where | Comment must say |
|------|-------|------------------|
| RAG chunking (D7) | class `RagChunkService` in `server/src/ai-agent/services/rag-chunk/rag-chunk.service.ts`; model `RagChunk` in `schema.prisma` | Kept by decision D7. Not called from anywhere and nothing reads `rag_chunks` yet. `syncEmailToMemory` stores the raw email body in `ai_memories`: do not call it from the email worker until the rule in section 6.3 (summary only, source excluded from pre-turn retrieval) is met. |
| `queue_jobs` (D11) | model `QueueJob` in `schema.prisma` | Kept by decision D11. Unused: BullMQ keeps job state in Redis. |
| `user_sessions.device_id` (D14) | field `deviceId` on `UserSession` in `schema.prisma` | Kept by decision D14 for future multi-user / multi-device support. Never written today. |

`@langchain/textsplitters` stays in `server/package.json` (used by `RagChunkService`).

---

## 4. Remaining hardening (Phase 5)

### 4.1 Response interceptor (rest of task 5.2) — backlog (D17), not scheduled

Kept here as the description for when it is picked up. Today every handler in the seven controllers returns `{ statusCode, message, data }` by hand, with a Vietnamese
`message` per route. Task 5.2 asks for one interceptor so handlers return data only.

- New `server/src/common/interceptors/response.interceptor.ts`: wrap the handler result as
  `{ statusCode: <response status>, message, data }`.
- Keep the per-route messages: add a small `@ResponseMessage('…')` decorator (`SetMetadata`) and read it in the
  interceptor with `Reflector`; default `'OK'`.
- Register with `{ provide: APP_INTERCEPTOR, useClass: ResponseInterceptor }` in `server/src/app.module.ts`.
- The interceptor must **skip** responses that are not JSON bodies: the SSE route `POST /ai-agent/chat/stream`
  (an `Observable` of frames), `POST /ai-agent/tts` (uses `@Res()` and pipes a stream) and `GET /` (plain string).
  Simplest: a `@SkipResponseEnvelope()` decorator on those three handlers.
- Then change every handler to return the data and move its message into `@ResponseMessage`.
- Verify: for each route in `api.md`, the response body before and after is identical. A unit test for the
  interceptor (wraps, skips, uses the custom message).
- This is a large mechanical diff with no behaviour change.

### 4.2 `trust proxy` (rest of task 5.4)

`server/src/auth/auth.controller.ts` records `req.ip` at login and the login throttle keys on it. Behind a reverse
proxy every client would share the proxy's address. The public URL that task 6.2 needs (tunnel or reverse proxy)
is such a deployment. When a deployment behind a proxy is planned: add an optional
`TRUST_PROXY` variable to `server/src/config/env.validation.ts`, `.env.example` and `environment.md`, and in
`server/src/main.ts` call `app.set('trust proxy', <value>)` when it is set (create the app as
`NestFactory.create<NestExpressApplication>(AppModule)`). Not needed for local use.

### 4.3 Known shortcuts left in the code

Each is marked in the source with a `shortcut:` comment. None blocks use by one person on one process.

| Where | Limit | Upgrade when |
|-------|-------|--------------|
| `ai-agent/services/agent/pending-action.store.ts` | Pending AI actions live in a `Map`; lost on restart, not shared between instances | More than one server process → store in Redis with a 5-minute TTL |
| `email/email-rule.service.ts` (`assertValidRegex`) | Regex rules are length-limited (200) and syntax-checked only; no ReDoS protection | Rules can be created by anyone other than the owner → use `re2` |
| `ai-agent/services/memory/memory.service.ts` | `minScore` default 0.5 is a guess | Section 1.3 item 2 |
| `finance/finance.service.ts` (`adjustBalance`) | Reads the balance and writes the delta in one transaction at the default isolation level; a transaction created in between is kept correctly in the ledger, but the final balance then differs from the requested `newBalance` | Concurrent writers exist → `SELECT … FOR UPDATE` on the account row |

---

## 5. Documentation refactor (Phase 4)

Target structure and the status-tag rule (`[Implemented]` / `[Partial]` / `[Planned]`) are in `plan.md` Phase 4.
Already in the target structure: `api.md`, `setup.md`, `environment.md`, `decisions.md`. Everything below is still
to write. Write from the code, not from the old documents. This phase now comes after sections 3 and 6, so
describe the finished code: where a line below says "`[Planned]` (until 6.x)", use the status the code has by then.
The "Documents:" lines in section 6 apply only to documents that already exist when that task is done.

### 5.1 Task 4.1 — skeleton and conventions

- New `documents/README.md`: index of the documents; the status legend; "Swagger at `/api/docs` is the API
  reference, the `.md` files describe design and status".
- New `documents/conventions.md`:
  - response envelope `{ statusCode, message, data }`;
  - errors: Nest HTTP exceptions; Prisma `P2002` → 409, `P2025` → 404, `P2003` → 400
    (`server/src/common/filters/prisma-exception.filter.ts`);
  - auth model: global `JwtAuthGuard`, `@Public()` for exceptions, access token (`JWT_SECRET`, `typ: 'access'`,
    checked against `user_sessions` on every request), refresh token (`JWT_REFRESH_SECRET`, `typ: 'refresh'`,
    stored as SHA-256 hash, rotated on use, replay ends the session), OAuth `state` token (`typ: 'oauth_state'`,
    10 minutes);
  - global prefix `api/v1`;
  - timezone: stored times are UTC; `APP_TIMEZONE` is used for reminder text and the chat system instruction;
  - language (D15): documents in English; Swagger strings and log messages stay Vietnamese.
- New `documents/templates/module.md` with the sections: status table (capability, status, code location),
  responsibilities, data, behaviour, AI tools, limitations, planned.
- Delete `documents/templates/controller.md` and `documents/templates/service.md`.

### 5.2 Task 4.2 — rewrite `summary.md`

- Stack line: NestJS, Prisma (no TypeORM), Gemini through `@google/genai` (no OpenAI / Anthropic), Postgres +
  pgvector, Redis + BullMQ, Fish.audio.
- Tag every capability:
  - Clients (Next.js, React Native): `[Planned]`.
  - Google Pub/Sub push ingestion: `[Planned]` (until 6.2; D3). Gmail polling: not built. Manual ingest endpoint: `[Implemented]`.
  - Rule pre-filtering (blacklist > moneylist > whitelist, at ingestion): `[Implemented]`.
  - AI classification and extraction: `[Planned]` (until 6.3).
  - Telegram alerts: `[Planned]` (until 6.1). Push notifications, inline buttons: `[Planned]`.
  - Ledger with cached balance: `[Implemented]`. Totals are per currency.
  - Calendar: "local is the source of truth, pushed one way to Google" `[Implemented]`; pull sync `[Planned]`.
  - Chat with tools and write confirmation: `[Implemented]`. Conversation history is held by the client until
    6.4; after it, sessions and full messages are stored in `chat_sessions` / `chat_messages` (D19), never in the
    vector store, and only messages the AI marks important become memories (D20).
  - Hybrid memory: `[Partial]` (limitation: relevance cut-off untuned; no update endpoint).
  - Memory decay "applied at query time": `[Implemented]`; decay job and pruning: de-scoped (D6).
  - RAG chunking: `[Planned]` (limitation: `RagChunkService` and `rag_chunks` exist but nothing calls or reads
    them; D7).
  - TTS: `[Implemented]` as a streamed MP3.
  - Proactive: reminder cron `[Partial]` (limitation: no delivery channel, messages are only logged);
    daily window, quiet cron, context evaluation `[Planned]` (D9).
- Replace "zero duplicate" with the mechanism: unique `email_logs.message_id`, unique `transactions.email_log_id`.
- Verify: `grep -n "TypeORM\|OpenAI\|Anthropic" documents/summary.md` prints nothing.

### 5.3 Task 4.4 — `database.md` replaces `db.md`

- One section per model in `server/prisma/schema.prisma`: columns, constraints, relations and `onDelete` rules.
- List the indexes, including the three that are only in migrations: `characters_single_active` (partial unique,
  `WHERE is_active`), `ai_memories_embedding_hnsw` (`vector_cosine_ops`), `ai_memories_content_tsv_gin`.
- State: Google tokens are encrypted with AES-256-GCM (`v1:<iv>:<tag>:<ciphertext>`); refresh tokens are stored as
  SHA-256 hashes (not "encrypted"); the embedding is 1536 dimensions.
- Do not document `dedup_hash` (gone). Do not document `memory_decay_logs` once 3.8 is done.
- Document `queue_jobs`, `rag_chunks` and `user_sessions.device_id` as kept but unused, each with its decision
  (D11, D7, D14) and the reason from section 3.2.
- Once 6.4 is done: document `chat_sessions`, `chat_messages` and `characters.memory_rule`; state that the chat
  tables hold full text, have no embedding, and that `chat_messages.memory_id` is the only link to `ai_memories`.
- Delete `documents/db.md`.
- Verify: every table name in the document equals a `@@map` name in the schema, and the reverse.

### 5.4 Task 4.5 — module documents

Delete the fourteen `documents/modules/*/*.controller.md`, `*.service.md` and `email.worker.md` files and write
`documents/modules/auth.md`, `character.md`, `email.md`, `finance.md`, `calendar.md`, `ai-agent.md`,
`proactive.md` from the template. Do not repeat route tables: link to `api.md`. Facts each must contain:

- **auth.md** — login with `email` + `password`; response `accessToken` + `user`, refresh token in an http-only
  cookie (path `/api/v1/auth`, lifetime from the token's `exp`); the three token types; session check in
  `JwtStrategy`; rotation and replay; per-session logout with optional `sessionId`; login throttle 5/minute;
  Google OAuth with signed `state`, scopes `https://mail.google.com/`, `…/auth/calendar`, `…/auth/userinfo.email`;
  `GoogleClientFactory` (decrypts, sets `expiry_date`, persists refreshed tokens); bootstrap by `npm run seed`.
- **character.md** — one `CharacterService`; exactly one active character (transaction + partial unique index);
  nested persona routes with ownership check; `voiceId` and `source` optional.
- **email.md** — `POST /email/ingest` is an authenticated manual endpoint, not a Pub/Sub receiver; flow
  `EmailService.ingest`: insert (duplicate `message_id` → ignored) → `EmailRuleService.classify` → blacklist saved
  `SKIPPED` and not queued, otherwise queued with priority moneylist 1, whitelist 2, unmatched 3; job options
  (`jobId` = email log ID, 3 attempts, exponential backoff 5 s, keep 100 completed / 50 failed); queue name
  `email-processing`; worker class `EmailProcessor` (`WorkerHost`, `@OnWorkerEvent('failed')` sets `FAILED` after
  the last attempt; concurrency from `BULLMQ_CONCURRENCY`); statuses `PENDING`, `PROCESSED`, `SKIPPED`, `FAILED`;
  before 6.3 the worker only sets a status (moneylist / whitelist → `PROCESSED`, unmatched → `SKIPPED`); after
  6.3 every queued mail is classified, with the prompt chosen by rule type (D18).
  `[Planned]`: Gmail Pub/Sub push receiver (6.2), AI classification (6.3), logs endpoints.
- **finance.md** — field names `cachedBalance`, `emailLogId`; balance changes only through
  `increment` / `decrement` inside the transaction; integrity rules (active account, category type equals
  transaction type, existing email log, unique `email_log_id`); account deletion restricted (deactivate when it has
  transactions); `PATCH /accounts/:id/balance`; totals per currency; paginated `transactions/search`.
  `[Planned]`: summary endpoint, update transaction / category.
- **calendar.md** — one-way push; the algorithm in `calendar-sync.service.ts` (deleted → `events.delete` then
  purge; insert with client-supplied ID, 409 → update; `events.patch` with `summary`, `description`, `location`,
  `start`, `end` only; 404/410 → clear the Google ID and stop; mark `SYNCED` only if the sync-state row is
  unchanged since it was read; one run at a time); schedule from `CALENDAR_SYNC_CRON`; soft delete (`deleted_at`);
  range filter means "overlaps"; `endTime > startTime`. `[Planned]`: pull sync, `If-Match` / `CONFLICT`,
  immediate sync.
- **ai-agent.md** — chat over POST SSE with the frame types from `api.md`; client-held `history` (max 20 turns)
  before 6.4, server-stored sessions and messages after it (section 6.4: tables, `session` frame, ownership check,
  the importance rule from the character and `memory_id`);
  system instruction = persona + current time and timezone + up to 5 recalled memories marked as data, not
  instructions; tool loop limit 5 rounds; the ten tools by their real names with the confirmation column
  (table in `api.md`); the one-argument tool contract and DTO validation; pending actions expire after 5 minutes
  and are lost on restart; memory: `'simple'` text search configuration (better for Vietnamese), hybrid score
  `(0.7 × cosine + 0.3 × normalised ts_rank) × decayed score`, decay `S0 · e^(−λt)` at query time with default
  λ = 0.01, `minScore`; classes `AgentService`, `MemoryService`, `TtsService`, `GenAiProvider`,
  `PendingActionStore`, `MemoryTools`; `RagChunkService` listed as kept but unused (D7); TTS as a streamed MP3.
- **proactive.md** — route and both enums (`ProactiveTriggerType`, `ProactiveChannel`); reminder cron every
  10 minutes for events starting within 15 minutes, once per event (`reminded_at`, reset when `startTime` changes);
  status values (`LOGGED` today; `SENT` / `FAILED` / `NOT_CONFIGURED` after 6.1). `[Planned]`: other triggers.

Verify: `grep -rn "AiService\|AiToolRegistryService\|src/shared\|@Process()\|OnQueue" documents/modules` prints nothing.

### 5.5 Task 4.6 — flow diagrams

Move the four `documents/modules/*/*-flow.mermaid.live` files to `documents/flows/email.mmd`, `finance.mmd`,
`calendar.mmd`, `ai-agent.mmd` and redraw them from the code:

- Email: authenticated ingest → rules → queue → worker. Gmail → Pub/Sub → push receiver drawn dashed and
  labelled `Planned` until 6.2 is done, solid afterwards.
- AI: `POST /ai-agent/chat/stream`, pre-turn memory retrieval, tool loop, confirmation branch. `RagChunkService`
  is not in this flow (kept but unused, D7). Session load, message storage and the "marked important →
  `ai_memories`" branch drawn dashed and labelled `Planned` until 6.4 is done, solid afterwards.
- Calendar: local write → `DIRTY` → cron / `POST /calendar/sync` → Google, with the delete branch.
- Remove every `[cite: N]` marker. Draw planned steps dashed and labelled `Planned`.
- Verify: each file renders in a Mermaid viewer; `grep -rn "cite:" documents/flows` prints nothing.

### 5.6 Task 4.7 — `configs/AiTool-Decorator.md`

Rewrite in place as one English document describing `server/src/common/decorators/ai-tool.decorator.ts`:
`AiToolOptions` (`name`, `description`, `parameters`, `dto`, `requiresConfirmation`), the rule that a tool method
takes exactly one argument object, how `AgentService.discoverAiTools` finds tools, how arguments are validated
(`plainToInstance` + `validate` with `whitelist` and `forbidNonWhitelisted`), and how to add a tool (wrapper class
such as `server/src/calendar/calendar.tools.ts`).

### 5.7 Rest of task 4.8

Delete `documents/modules/log.md` (a generation log with stale routes). Move anything still useful into
`decisions.md` first.

### 5.8 After Phase 4

`report.md` and `plan.md` describe the code as it was before the refactor. Add one line at the top of each saying
so and pointing to `documents/README.md`, or move them to `documents/archive/`.

---

## 6. Core features (Phase 6)

Do them in this order. All decisions are answered (section 2). Split further when starting. Each task is done
when its unit tests pass with the external client stubbed; the real-service check is in section 1.4.

### 6.1 Telegram delivery (D4: text only)

- New `server/src/proactive/telegram.client.ts`: `sendMessage(text)` → `POST
  https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendMessage` with `{ chat_id: TELEGRAM_CHAT_ID, text }` using
  `fetch`. Both variables already exist as optional keys in `env.validation.ts`, `.env.example` and
  `environment.md`.
- `server/src/proactive/proactive.service.ts`:
  - `dispatchNotification` currently only logs and returns `{ status: 'LOGGED', at }`. Change it to return `SENT` on
    HTTP 200, `FAILED` on an error (log the upstream body, do not return it), `NOT_CONFIGURED` when the token or
    chat ID is missing. Widen the type `ProactiveDispatchStatus` accordingly.
  - `evaluateAndTrigger` already computes `success` as `status === 'SENT'`; remove the `as string` cast once the
    type is widened.
  - In `handleFallbackCron`, set `remindedAt` only when the dispatch status is `SENT` — otherwise a failed delivery
    is never retried. (Today it is set unconditionally, which is right only while nothing is delivered.)
- `server/src/proactive/dto/trigger-proactive.dto.ts`: remove `PUSH_NOTIFICATION` and `ALL` from
  `ProactiveChannel`; remove them from the `enum` and description of the `send_proactive_notification` tool
  declaration in `proactive.service.ts`.
- Register the client in `server/src/proactive/proactive.module.ts`.
- Tests: with `fetch` stubbed — 200 → `SENT`; 500 → `FAILED`; no token → `NOT_CONFIGURED` and no request.
- Real delivery with a bot token is checked in section 1.4.
- Documents: `api.md` (proactive row), `environment.md` (remove "planned"), `modules/proactive.md`, `summary.md`.

### 6.2 Gmail Pub/Sub push ingestion (D3: keep Pub/Sub)

Gmail publishes a notification to a Pub/Sub topic when the mailbox changes; a push subscription posts it to this
server; the server then fetches the new messages from the Gmail API. The notification carries no email content.

- **Needs a public HTTPS URL to run for real.** Pub/Sub push cannot reach `localhost`. That is an integration
  concern (section 1.4, tunnel or reverse proxy, recorded in `setup.md`); the code and its tests do not need it.
- Google Cloud setup (write it into `setup.md`):
  - A Pub/Sub topic. Grant `gmail-api-push@system.gserviceaccount.com` the Pub/Sub Publisher role on it.
  - A push subscription to `https://<host>/api/v1/email/pubsub` with authentication enabled: a service account
    and an audience.
- Environment (add to `env.validation.ts`, `.env.example`, `environment.md`; all optional, the receiver answers 503
  when they are missing): `GMAIL_PUBSUB_TOPIC` (`projects/<project>/topics/<topic>`), `PUBSUB_PUSH_AUDIENCE`,
  `PUBSUB_PUSH_SERVICE_ACCOUNT` (the service account email).
- Schema: `users.gmail_history_id` (`String?`), migration `user_gmail_history_id`.
- New `server/src/email/gmail-push.service.ts`, registered in `server/src/email/email.module.ts`; that module must
  import `AuthModule` to get `GoogleClientFactory`.
- Watch:
  - `users.watch` with `{ topicName: GMAIL_PUBSUB_TOPIC, labelIds: ['INBOX'] }`. Store the returned `historyId`
    when none is stored yet.
  - A watch expires after 7 days. Renew it once a day with a cron registered at bootstrap through
    `SchedulerRegistry` exactly as `CalendarSyncService.onApplicationBootstrap` does (do not put `process.env` in a
    decorator — plan risk R5), and once at startup when a Google account is connected.
- Receiver `POST /api/v1/email/pubsub` in `server/src/email/email.controller.ts`:
  - `@Public()` (Pub/Sub sends no application JWT) **plus its own verification** (plan risk R1): read the bearer
    token from `Authorization`, verify it with `OAuth2Client.verifyIdToken({ idToken, audience:
    PUBSUB_PUSH_AUDIENCE })`, and require `email === PUBSUB_PUSH_SERVICE_ACCOUNT` and `email_verified`. Anything
    else → 401. This is a trust boundary: never skip it, also not in development.
  - Body: `{ message: { data, messageId, publishTime }, subscription }`; `data` is base64 JSON
    `{ emailAddress, historyId }`. Validate with a DTO.
  - Answer 2xx only after the pass succeeded. Any other status makes Pub/Sub deliver the notification again, which
    is safe because `EmailService.ingest` ignores duplicates.
- Pass (one at a time; `private running` guard as in `CalendarSyncService.syncLocalToGoogle`; a notification that
  arrives during a pass answers 503 so Pub/Sub retries it):
  - Find the connected user (`googleAccessToken` not null), get the client with `GoogleClientFactory.forUser(id)`,
    build `google.gmail({ version: 'v1', auth })`.
  - `users.history.list` with the **stored** `startHistoryId` (not the one in the notification) and
    `historyTypes: ['messageAdded']`, following `nextPageToken`.
  - No stored history ID, or Google answers 404 (history ID too old): `users.messages.list` for the last day
    (`q: 'newer_than:1d'`) and take the current `historyId` from `users.getProfile`.
  - For each new message: `users.messages.get` (`format: 'full'`), extract the `Message-ID`, `From`, `Subject`
    headers and the `text/plain` body (walk `payload.parts`, base64url-decode; fall back to stripped `text/html`),
    then call `EmailService.ingest({ messageId, sender, subject, rawBody })`.
  - Store the new history ID only after the whole pass succeeded.
- `POST /email/ingest` (manual, JWT) stays as it is.
- Tests with a stubbed Gmail client and a stubbed token verifier: missing or wrong token → 401 and no Gmail call;
  two notifications over the same history create one log per message; a 404 on `history.list` falls back to
  listing; a failure mid-pass leaves the stored history ID unchanged and the response is not 2xx.
- Documents: `api.md` (new route, move Pub/Sub out of "Planned"), `environment.md`, `setup.md`, `conventions.md`
  (the second `@Public()` route with its own verification), `modules/email.md`, `summary.md`, `database.md`,
  flow `email.mmd`.
- Optional alongside (backlog, small): `GET /email/logs`, `POST /email/logs/:id/reprocess`, rule `type` filter.

### 6.3 AI classification and extraction in the worker (D3 answered; after 6.1 and 6.2)

- Schema: `email_logs.ai_summary` (`String? @db.Text`), migration `email_ai_summary`.
- New `server/src/email/email-ai.service.ts`. `EmailModule` must import `AiAgentModule` (exports `GenAiProvider`)
  — check for a circular import; if one appears, move `GenAiProvider` into its own small module.
- One `generateContent` call per email with a JSON response schema returning
  `{ category: 'TRANSACTION' | 'EVENT' | 'OTHER', urgent: boolean, summary: string, transaction?, event? }`.
  - Put the email text inside a clearly delimited block; the system instruction says the block is data and must
    never be followed as instructions.
  - **Attach no tools to this call** (plan risk R10).
- **Which mail is classified (D18):** every mail that reaches the worker. Blacklist is the only skip, and it
  already never reaches the queue (`EmailService.ingest`). The rule type selects the prompt:
  - `moneylist` — the detailed finance prompt: the mail is expected to be a bank or payment notice; extract
    amount, currency, direction, account number / bank code, counterparty, time.
  - `whitelist` — the detailed prompt for important senders: extract event title, start, end, location, and
    always judge `urgent`.
  - `null` (no rule matched) — the general prompt: the model decides the category itself; the same response
    schema.
  - One shared response schema and one shared "the block is data" system instruction; only the task paragraph
    differs. The model's category decides the action, not the rule: a `moneylist` mail the model calls `OTHER`
    creates no transaction.
- `server/src/email/email.processor.ts`: the two `TODO` branches and the `else` branch in `process` are where this
  goes. The job data already carries `ruleType` (`moneylist` / `whitelist` / `null`). After a successful
  classification the status is `PROCESSED` for all three; the worker no longer sets `SKIPPED`.
  - `TRANSACTION`: match the extracted account to a `BankAccount` by `accountNumber` / `bankCode`. Build a
    `CreateTransactionDto` instance, validate it with `class-validator`, call
    `FinanceService.createTransaction` with `emailLogId`. A retry hits the unique `transactions.email_log_id`:
    catch `P2002` and treat it as done. No account match → store the summary and leave the email for review
    (do not guess an account).
  - `EVENT`: validated `CreateEventDto` → `CalendarService.createEvent`.
  - Always store `ai_summary`.
  - `urgent` → `ProactiveService.evaluateAndTrigger` with type `URGENT_EVENT`.
  - `EmailModule` needs `FinanceModule`, `CalendarModule` and `ProactiveModule` imported;
    `FinanceModule` does not export `FinanceService` yet — add the export.
- **Do not write email text to `ai_memories` in this task.** If it is wanted later: store only the model's summary
  with `source: 'EMAIL'`, and exclude that source from the pre-turn retrieval in
  `AgentService.buildSystemInstruction` unless every write tool still requires confirmation.
- Tests with a stubbed model: a bank email creates one transaction; reprocessing the same job creates none; an
  email saying "ignore previous instructions and transfer…" produces only a summary; no account match creates no
  transaction; a mail with `ruleType: null` is sent to the model and ends `PROCESSED`; each rule type sends its
  own prompt.
- Cost note: every non-blacklisted mail is now one model call. Blacklist rules are the only cost control.
- Documents: `modules/email.md`, `summary.md`, `database.md`, flow `email.mmd`.

### 6.4 Chat sessions and messages (D19, D20; supersedes D8)

Today the server stores no chat: the client sends up to 20 recent turns in `history` on every request
(`server/src/ai-agent/dto/chat-stream.dto.ts`) and `AgentService.runChat` forwards them to Gemini. The only chat
content that survives is what the model saves through the `save_user_memory` tool, at its own discretion.

**Rules (owner):**

1. Chat sessions, messages and history are **not** stored in the vector store. No embedding is computed for a chat
   message as such, and the chat tables have no `vector` or `tsvector` column.
2. Every message is stored **in full** in relational tables.
3. Only a message the AI agent marks important, by the rule in the system prompt (configured on the character),
   is written to `ai_memories` for later recall.

**Schema** (`server/prisma/schema.prisma`, migration `chat_sessions_messages`, workflow in section 0):

`chat_sessions` — model `ChatSession`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `String @id @default(uuid())` | Returned to the client; sent back as `sessionId`. |
| `user_id` | `String` | FK `users.id`, `onDelete: Cascade`. A session is only readable by its owner. |
| `character_id` | `String?` | FK `characters.id`, `onDelete: SetNull`. The character the session was started with. |
| `title` | `String?` | First 80 characters of the first user message. No model call for a title. |
| `last_message_at` | `DateTime @default(now())` | Updated with every stored message; list order. |
| `created_at`, `updated_at` | `DateTime` | As elsewhere. |

Index: `@@index([userId, lastMessageAt])`.

`chat_messages` — model `ChatMessage`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `String @id @default(uuid())` | |
| `session_id` | `String` | FK `chat_sessions.id`, `onDelete: Cascade`. |
| `role` | enum `ChatRole { USER MODEL }` | Maps to Gemini's `user` / `model`. |
| `content` | `String @db.Text` | The full message. No length cut on storage. |
| `tool_calls` | `Json?` | On a `MODEL` row: the tool calls of the turn with their results or the pending `actionId`. Not replayed to the model. |
| `memory_id` | `String? @unique` | FK `ai_memories.id`, `onDelete: SetNull`. Set when this message was marked important (rule 3). Null for every other message. |
| `created_at` | `DateTime @default(now())` | |

Index: `@@index([sessionId, createdAt])`.

`characters` gains `memory_rule` (`String? @db.Text`) — the importance rule; see D20-a in section 2.2.
`ai_memories` is unchanged: a chat memory keeps `source: 'CHAT'`, and the message points to it, not the reverse.
Deleting a session deletes its messages and keeps the memories made from them.

**Chat route** `POST /ai-agent/chat/stream`:

- Body becomes `{ message, sessionId?, characterId? }`. `history` is removed from `ChatStreamDto`
  (`ChatHistoryTurnDto` is deleted): the server is the only source of history.
- No `sessionId`: create a session for the JWT user. With `sessionId`: load it and require
  `session.userId === req.user.id`, else 404 (do not reveal that it exists).
- First frame of every stream: `{ "type": "session", "sessionId": "…" }`.
- Before calling the model: insert the `USER` message. History for the model = the last 20 messages of the session
  before this one, oldest first (same limit as today).
- At `done`: insert one `MODEL` message with the concatenated answer text and `tool_calls`. A turn that ends in
  `error` or is cancelled by the client stores the `USER` message only; a partial answer is not stored.
- A turn that ends in `confirmation_required` stores the `MODEL` message with the pending action in `tool_calls`.
  Confirming or discarding the action later does not rewrite the message.

**New routes** (JWT, owner only, envelope as elsewhere):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/ai-agent/sessions?page=&pageSize=` | Sessions of the user, newest `last_message_at` first (`pageSize` max 50). |
| GET | `/ai-agent/sessions/:id/messages?page=&pageSize=` | Messages of one session, oldest first. |
| DELETE | `/ai-agent/sessions/:id` | Delete a session and its messages. |

**Important messages (rule 3):**

- The rule text comes from the character (`memory_rule`). `AgentService.buildSystemInstruction` adds one paragraph:
  the rule, and "call `save_user_memory` only for a message that meets this rule; never for anything else".
  A character without a rule uses a built-in default constant (long-lived facts about the owner: identity,
  preferences, relationships, commitments). The exact wording is configured later by the owner.
- Marking a message important **is** the existing `save_user_memory` tool call (`server/src/ai-agent/tools/memory.tools.ts`).
  No second model call per message. It needs no confirmation today; keep that.
- When the tool runs inside a chat turn, set `chat_messages.memory_id` of that turn's `USER` message to the new
  memory. The tool method takes one argument object (tool contract), so pass the message ID through the turn
  context in `AgentService`, not through a model-supplied argument.
- What is embedded: see D20-b in section 2.2.
- Nothing else writes chat content to `ai_memories`: no automatic per-message or per-session embedding, no
  summary job, and `RagChunkService` stays unused (D7).
- Pre-turn retrieval is unchanged: up to 5 memories from `ai_memories`. It never queries the chat tables.

**Code:** new `server/src/ai-agent/services/chat/chat-session.service.ts` (create / load with ownership check /
append message / list / delete), registered in `server/src/ai-agent/ai-agent.module.ts`; `AgentService.runChat`
uses it; the three routes go in `server/src/ai-agent/ai-agent.controller.ts`. The handler needs the user ID from
the request (`req.user`), which the chat route does not read today.

**Tests** with a stubbed model: a request without `sessionId` creates one session and emits the `session` frame;
a second request with it sends the first turn to the model as history; another user's `sessionId` → 404 and no
model call; a turn without a tool call writes two `chat_messages` rows and nothing to `ai_memories`; a turn where
the model calls `save_user_memory` writes one memory and sets `memory_id` on that `USER` message only; an `error`
turn stores no `MODEL` row; the character's `memory_rule` appears in the system instruction, and the default
appears when it is null.

**Breaking change for clients:** `history` is no longer accepted (the global `ValidationPipe` strips it), and the
first frame is new. No client exists yet (D10).

- Documents: `api.md` (chat body, `session` frame, three routes, remove the "Planned" line), `decisions.md`,
  `modules/ai-agent.md`, `modules/character.md` (`memory_rule`), `summary.md`, `database.md`, flow `ai-agent.mmd`.

---

## 7. Backlog (not scheduled)

From `plan.md` "Backlog". Build only when something needs it.

- Response interceptor (D17; description in section 4.1).
- Push notifications, Telegram inline buttons.
- Pull sync from Google, `If-Match` and `CONFLICT` handling, immediate sync after a local write.
- Memory update endpoint. (Server-side chat sessions moved to task 6.4, D19.)
- Daily 17:20 window, 3-hour quiet cron, context evaluation.
- `GET /finance/summary`, parameterised summary tool, update transaction, update category, `categories.updated_at`.

---

## 8. Finishing

1. Sections 3–6 are committed; all of section 1 (including 1.4) passes.
2. D16 is answered: the repository is private and the example password in `server/docker-compose.yml` may be
   pushed. If the repository is ever made public, revisit this.
3. Merge `refactor/plan-phase-0-3` into `main` and push.
4. Fresh-clone test: clone into a new directory and reach a successful login by following `setup.md` only.
   Fix `setup.md` wherever that fails.
