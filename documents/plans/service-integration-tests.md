# Plan — service-layer integration tests

Written 2026-10-13. Nothing in this plan is built yet.

Goal: every service runs its real Prisma queries against a real Postgres (pgvector) database.
Third parties (Gemini, Google Calendar / Gmail / OAuth, Fish.audio, Telegram) are faked. The BullMQ queue is faked too
(see decision T2).

## 1. Review of the service layer

### 1.1 What exists today

19 spec files, 114 tests, all green. Every one of them builds the service with `new Service(fakePrisma, ...)` and
asserts on `vi.fn()` calls. No test has ever sent a query to Postgres. So these are unproven:

| Unproven today | Where |
|----------------|-------|
| Raw SQL: `::vector` cast, `<=>`, `ts_rank`, decay formula, column aliases, parameter types of `LIMIT` / `minScore` | `ai-agent/queries/memory.queries.ts` |
| Partial unique index `characters_single_active` and the deactivate-then-write transactions that depend on it | `character.service.ts` |
| Rollback of the balance update when the insert fails (`transactions.email_log_id` unique, P2002) | `finance.service.ts`, `email.processor.ts` |
| `onDelete` rules: Cascade (session → refresh tokens, character → personas, chat session → messages, event → sync state), SetNull (category, email log, memory, character on chat session), Restrict (account with transactions) | schema + every `delete*` method |
| Optimistic check `where: { id, updatedAt }` in `markSynced` (depends on `@updatedAt` being bumped by `CalendarService.updateEvent`) | `calendar-sync.service.ts` |
| P2002 duplicate handling by real constraint, not by a mocked error object | `email.service.ts` `createEmailLog` |
| Cursor pagination with `orderBy [createdAt desc, id desc]` + `skip: 1` | `chat-session.service.ts` `recentHistory` |
| `Decimal(18,2)` arithmetic done by the database (`increment` / `decrement`, `groupBy _sum`) | `finance.service.ts` |
| Case-insensitive `bankCode` match and "exactly one active account" rule | `email.processor.ts` `createTransaction` |

### 1.2 Per-service notes

| Service | DB tables | Third party | Notes |
|---------|-----------|-------------|-------|
| `AuthService` | users, user_sessions, refresh_tokens | Google OAuth (`getToken`) | Rotation and replay detection are the core. `JwtService` and bcrypt stay real. |
| `GoogleClientFactory` | users | googleapis | Token encryption round trip is DB-observable. Used for real by sync tests. |
| `CharacterService` | characters, personas | none | Three transactions rely on the partial unique index. |
| `FinanceService` | bank_accounts, transactions, categories, email_logs | none | Most DB logic in the project. Highest value. |
| `CalendarService` | local_calendars, calendar_sync_states | none | Soft vs hard delete depends on `googleEventId`. |
| `CalendarSyncService` | same + users | Google Calendar | Fake `google.calendar`. Do not run the cron. |
| `EmailRuleService` | email_rules | none | `classify` precedence is pure logic over a real query. |
| `EmailService` | email_logs | BullMQ queue | Queue faked (T2). |
| `EmailAiService` | none | Gemini | No DB. Already unit tested. **No integration test.** |
| `EmailProcessor` | email_logs + finance + calendar | Gemini, Telegram | Call `process(job)` and `onFailed(job, err)` directly with a plain job object. |
| `GmailPushService` | users | Gmail, Google ID token verify | Fake `google.gmail`. `verifyPushToken` has no DB: skip. |
| `MemoryService` | ai_memories | Gemini embeddings | Raw SQL. Second-highest value. |
| `RagChunkService` | rag_chunks, ai_memories | Gemini embeddings | Unused by decision D7. One smoke test only. |
| `ChatSessionService` | chat_sessions, chat_messages | none | Ownership checks and history ordering. |
| `AgentService` | chat + characters + every `@AiTool` | Gemini chat | Needs Nest DI (`DiscoveryService`). Tools run for real against the DB. |
| `TtsService` | characters (one read) | Fish.audio (`fetch`) | Only the voice fallback touches the DB. Two tests. |
| `ProactiveService` | local_calendars | Telegram | `handleFallbackCron` called directly. |
| `PrismaService`, `AppService` | — | — | Covered by every other test. Nothing to add. |

### 1.3 Findings from the review

Not fixed by this plan. Each needs a decision before a test pins the behaviour.

| # | Finding | Severity |
|---|---------|----------|
| F1 | `FinanceService.adjustBalance` accepts an inactive account and writes a transaction on it. `createTransaction` rejects inactive accounts. Inconsistent. | Low |
| F2 | `CalendarService.deleteEvent` hard-deletes an event that has no `googleEventId`. If a sync pass has already inserted it on Google but not yet saved the ID, the Google copy is orphaned (`markSynced` updates 0 rows, silently). | Low (single user, 5-minute cron) |
| F3 | `AuthService.login` writes the session and the refresh token in two separate statements (a failure in between leaves an orphan session). Expired `refresh_tokens` / idle `user_sessions` are never purged. | Low |
| F4 | `ChatSessionService.listMessages` orders by `createdAt` only; `recentHistory` uses `createdAt, id`. Two messages in the same millisecond can page inconsistently. | Low |
| F5 | `RagChunkService.syncTransactionToMemory` hardcodes "VND" regardless of account currency; `splitAndSaveDocument` is not atomic. Service is unused (D7). | Info |
| F6 | `test/app.e2e-spec.ts` is the Nest scaffold (`GET /` → "Hello World!"). With the global `JwtAuthGuard` and BullMQ it is very likely broken. Not run during this review. | Info |

## 2. Decisions

| # | Decision | Reason |
|---|----------|--------|
| T1 | Separate database `secretary_test` on the existing docker Postgres (`secretary_user` has CREATEDB and owns the `vector` extension). No testcontainers, no new dependency. | Container is already required for dev. |
| T2 | BullMQ queue replaced by `{ add: vi.fn() }` through `getQueueToken('email-processing')`. No Redis in these tests. | A real queue on the shared dev Redis would let the dev worker consume test jobs and the reverse. Redis is infrastructure, not business logic. |
| T3 | Schema applied with `prisma migrate deploy`, never `db push`. | The partial unique index and the HNSW / GIN indexes exist only in hand-written migrations. |
| T4 | One Nest testing module built from `AppModule`, **compiled but not initialised** (`compile()` without `init()`), then `agentService.onModuleInit()` called by hand. | Real wiring and real `@AiTool` discovery, while no cron job starts, no BullMQ worker is created and `renewWatch` does not fire. Same trick as `app.module.spec.ts`. |
| T5 | Isolation by `TRUNCATE ... RESTART IDENTITY CASCADE` in `beforeEach`, files run serially (`fileParallelism: false`). | One database, about 9 files. Schema-per-worker is not worth the code yet. |
| T6 | Files named `*.int-spec.ts` in `server/test/integration/`, own config `vitest.config.int.ts`, script `test:int`. | Mirrors the existing `*.e2e-spec.ts` + `vitest.config.e2e.ts` pattern. `npm test` (`**/*.spec.ts`) stays DB-free. |
| T7 | Tests pin current behaviour. F1–F6 are not fixed here. | Scope. |

Skipped on purpose: controller / HTTP tests, CI workflow (no CI exists in the repo), coverage thresholds, testcontainers,
fixing `app.e2e-spec.ts`.

## 3. Scope

| File | Change |
|------|--------|
| `server/vitest.config.int.ts` | New. `include: ['test/integration/**/*.int-spec.ts']`, `fileParallelism: false`, `globalSetup`, `test.env`. |
| `server/test/integration/global-setup.ts` | New. Create database if missing, run `prisma migrate deploy`. |
| `server/test/integration/harness.ts` | New. `createTestModule()`, `resetDb()`, fakes. |
| `server/test/integration/*.int-spec.ts` | New. 9 files, section 5. |
| `server/package.json` | Add script `"test:int": "vitest run --config ./vitest.config.int.ts"`. |
| `server/.env.example` | Add commented `TEST_DATABASE_URL`. |
| `documents/setup.md` | One paragraph: how to run `npm run test:int`. |

No change to `src/`. No new dependency (`pg`, `vitest`, `@nestjs/testing` are installed).

## 4. Infrastructure (step 1)

### 4.1 `vitest.config.int.ts`

`test.env` sets every variable the app reads, so nothing falls through to `server/.env`:

- `DATABASE_URL` = `process.env.TEST_DATABASE_URL ?? 'postgresql://secretary_user:secretary_password@localhost:5432/secretary_test'`
- `JWT_SECRET`, `JWT_REFRESH_SECRET`: fixed 32+ character dummies. `JWT_EXPIRES_IN=15m`, `JWT_REFRESH_EXPIRES_IN=7d`.
- `REDIS_HOST=localhost`, `REDIS_PORT=6379` (validated at start, never connected: T2).
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: dummies. `TOKEN_ENCRYPTION_KEY`: fixed base64 of 32 bytes.
- `GEMINI_API_KEY=test`, `FISH_AUDIO_API_KEY=test`, `FISH_AUDIO_DEFAULT_VOICE_ID=default-voice`.
- `TELEGRAM_BOT_TOKEN=test`, `TELEGRAM_CHAT_ID=test`, `APP_TIMEZONE=Asia/Ho_Chi_Minh`.

**Check first:** `ConfigModule` still reads `server/.env` for any key not listed above. Confirm with one assertion that
`process.env` wins over the file (`configService.get('GEMINI_API_KEY') === 'test'`). If it does not, the dev
`.env` holds real keys and the plan must change before any other test is written.

### 4.2 `global-setup.ts`

1. Parse `DATABASE_URL`. **Throw unless the database name ends with `_test`.** The suite truncates every table.
2. Connect with `pg` to the `postgres` database; `CREATE DATABASE` if `pg_database` has no such row.
3. `execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL } })`.

### 4.3 `harness.ts`

- `createTestModule()`:
  `Test.createTestingModule({ imports: [AppModule] })`
  `.overrideProvider(getQueueToken('email-processing')).useValue(fakeQueue)`
  `.overrideProvider(GenAiProvider).useValue(fakeGenAi)`
  `.overrideProvider(TelegramClient).useValue(fakeTelegram)`
  `.compile()`, then `moduleRef.get(AgentService).onModuleInit()`. Returns the module and the fakes.
  Closed in `afterAll` with `moduleRef.close()` (confirm it disconnects Prisma; otherwise call `$disconnect()`).
- `resetDb(prisma)`: assert `current_database()` ends with `_test`, read table names from `pg_tables`
  (`schemaname = 'public'`, not `_prisma_migrations`), one `TRUNCATE ... RESTART IDENTITY CASCADE`.
- `fakeQueue`: `{ add: vi.fn(async (_n, data, opts) => ({ id: opts.jobId })) }`.
- `fakeTelegram`: `{ sendMessage: vi.fn().mockResolvedValue('SENT') }`.
- `fakeGenAi`: `get()` returns
  - `models.embedContent`: looks the text up in a `Map<string, number>` and returns a one-hot 1536-dimension
    vector on that axis (unknown text → axis 0). Same axis = similarity 1, different axis = 0. This makes search
    results exact without a real model.
  - `models.generateContent`: `vi.fn()` returning `{ text: JSON.stringify(classification) }`, set per test.
  - `chats.create`: returns `{ sendMessageStream }` that yields scripted chunks per round (same chunk shape as
    `agent.service.spec.ts`).
- Google: per test file `vi.spyOn(google, 'calendar')` / `vi.spyOn(google, 'gmail')` returning a fake client.
  `GoogleClientFactory.forUser` stays real, so the seeded user needs tokens written by `saveTokens`.
- Safety net: `vi.stubGlobal('fetch', ...)` that throws `unmocked fetch: <url>`. The TTS test replaces it per test.
- Small seed helpers only where three or more files need the same row: `seedUser()`, `seedAccount()`.

Step 1 is done when one trivial test (`CharacterService.createCharacter` round trip) passes with `npm run test:int`
and `npm test` still reports 114 passed.

## 5. Test cases

Each case asserts on rows read back from the database, not on mock calls, unless marked (fake).

### 5.1 `finance.int-spec.ts` (step 2)

| # | Case |
|---|------|
| 1 | `createTransaction` EXPENSE then INCOME: `cachedBalance` moves by the exact decimal (`50000.50`), row stored with `Decimal(18,2)`. |
| 2 | 20 concurrent `createTransaction` on one account: final balance = start ± sum (atomic increment, no lost update). |
| 3 | Unknown account → 404; inactive account → 400; category of the other type → 400; unknown `emailLogId` → 404. Balance unchanged in all four. |
| 4 | Second transaction with the same `emailLogId` → P2002 **and the balance update is rolled back**. |
| 5 | `deleteTransaction` restores the balance; unknown ID → 404. |
| 6 | `adjustBalance` up and down: one adjustment transaction of the right type and amount, balance = `newBalance`; equal balance → no row; unknown ID → 404. |
| 7 | `deleteBankAccount` with transactions → `isActive = false`, row kept; without → row gone. |
| 8 | `getAllBankAccounts` hides inactive unless asked; `getTotalBalance` groups by currency and excludes inactive. |
| 9 | `deleteCategory` → its transactions keep existing with `categoryId = null`. |
| 10 | `getAllTransactions`: each filter, inclusive date bounds, `transactionTime desc`, `page` / `pageSize` / `total`. |
| 11 | `getBankAccountById` returns at most 10 transactions, newest first. |

### 5.2 `auth.int-spec.ts` (step 3)

| # | Case |
|---|------|
| 1 | `login` success: one `user_sessions` row, one `refresh_tokens` row holding the SHA-256 of the token (never the token), `expiresAt` = token `exp`. |
| 2 | `login` wrong password / unknown email / inactive user / user without `passwordHash` → 401, no session row. |
| 3 | `refreshAccessToken`: old token `isRevoked = true`, new row, same session; new access token carries the session ID. |
| 4 | Replay of a rotated token → 401 and the session plus all its refresh tokens are gone (cascade). |
| 5 | Row expired in DB, token of a deleted session, inactive user, access token passed as refresh token → 401. |
| 6 | Two concurrent refreshes of the same token: exactly one succeeds. |
| 7 | `logout` deletes the session and cascades tokens; a session of another user is untouched. |
| 8 | `getActiveSession` bumps `lastActiveAt`; wrong user → 401. |
| 9 | `handleGoogleCallback` (fake `getToken`): tokens stored encrypted (column ≠ plaintext) and `GoogleClientFactory.forUser` decrypts them back; bad `state` → 400 and no write. |

### 5.3 `character.int-spec.ts` (step 1 smoke + step 3)

| # | Case |
|---|------|
| 1 | Create A active, create B active → only B active. Same through `updateCharacter` and `setActiveCharacter`. |
| 2 | Direct second active row is rejected by `characters_single_active` (proves the index is in the test schema). |
| 3 | Two concurrent `setActiveCharacter` on different rows: at most one active afterwards (one call may fail with P2002: record which). |
| 4 | `removeCharacter` cascades personas and sets `chat_sessions.character_id` to null. |
| 5 | Persona of character A addressed through character B → 404 on update and remove. |
| 6 | Unknown IDs → 404. |

### 5.4 `calendar.int-spec.ts` (step 4)

`CalendarService`

| # | Case |
|---|------|
| 1 | `createEvent` creates the sync state as `DIRTY`; `endTime <= startTime` → 400, nothing written. |
| 2 | `getEvents` overlap semantics on both bounds, ordered by `startTime`, soft-deleted hidden. |
| 3 | `updateEvent`: sync state back to `DIRTY`, `updatedAt` of the sync state changes, `remindedAt` cleared only when `startTime` changes, range validated against stored values for a partial update. |
| 4 | `deleteEvent` never pushed → both rows gone; pushed → `deletedAt` set, `DIRTY`, and `getEventById` → 404. |

`CalendarSyncService` (fake `google.calendar`, user seeded with encrypted tokens)

| # | Case |
|---|------|
| 5 | No connected user → `null`, no Google call. |
| 6 | New event → `insert` with ID = local ID without dashes; row `SYNCED` with `googleEventId`, `eTag`, `lastSyncedAt`. |
| 7 | Known event → `patch`; insert 409 → `patch`. |
| 8 | Soft-deleted → Google `delete` then local row and sync state gone; Google 404 on delete → still removed locally. |
| 9 | `patch` 404 → `SYNCED` with `googleEventId = null`, result `removedRemotely`. |
| 10 | Event edited through `CalendarService.updateEvent` while the fake Google call is pending → stays `DIRTY`, `googleEventId` saved. |
| 11 | One event fails with 500, the next one still syncs: `{ pushed: 1, failed: 1 }`, the failed one stays `DIRTY`. |

### 5.5 `email.int-spec.ts` (step 5)

`EmailRuleService`

| # | Case |
|---|------|
| 1 | CRUD round trip; invalid or over-long regex → 400 on create and on update that changes only `matcher`. |
| 2 | `classify`: blacklist beats moneylist beats whitelist; inactive rule ignored; sender / keyword / regex matchers; no match → `null`. |

`EmailService`

| # | Case |
|---|------|
| 3 | `ingest` new mail → `PENDING` row, queue `add` (fake) with `jobId` = log ID and priority by rule. |
| 4 | Blacklisted → `SKIPPED`, queue not called. |
| 5 | Same `messageId` again while `PENDING` → no second row, re-enqueued with the same `jobId`. After `PROCESSED` → `null`, queue not called. |
| 6 | Two concurrent `ingest` of the same `messageId` → exactly one row. |

`EmailProcessor` (`process` / `onFailed` called directly, `generateContent` faked)

| # | Case |
|---|------|
| 7 | TRANSACTION, one matching active account (bank code in another letter case) → transaction linked to the email log, balance moved, log `PROCESSED` with `aiSummary`. |
| 8 | No match / two matches / currency mismatch / invalid amount → no transaction, balance unchanged, log still `PROCESSED`. |
| 9 | `process` run twice for the same log → one transaction, balance moved once. |
| 10 | Transaction exists but log still `PENDING` (simulated crash) → retry does not double the balance, log becomes `PROCESSED`. |
| 11 | EVENT → `local_calendars` row with `DIRTY` sync state, default one-hour end; `end <= start` → no event, log `PROCESSED`. |
| 12 | `urgent: true` → Telegram (fake) called once with the summary; Telegram `FAILED` → log still `PROCESSED`. |
| 13 | Model returns invalid JSON → `process` rejects, log stays `PENDING`; `onFailed` on the last attempt → `FAILED`, on an earlier attempt → unchanged. |

`GmailPushService` (fake `google.gmail`)

| # | Case |
|---|------|
| 14 | `runPass` with stored history ID → new messages ingested, `users.gmail_history_id` advanced. |
| 15 | A message fetch fails with 500 → rejects, history ID **not** advanced; rerun ingests without duplicates. |
| 16 | History 404 → falls back to `listRecent`, history ID taken from the profile. |
| 17 | `renewWatch` stores the history ID only when none is stored. |

### 5.6 `memory.int-spec.ts` (step 6)

| # | Case |
|---|------|
| 1 | `saveMemory` → `embedding IS NOT NULL` and `content_tsv IS NOT NULL` (raw `SELECT`), defaults `GENERAL` / `MANUAL`. |
| 2 | Embedding of the wrong length → rejects and **no row is left** (transaction). |
| 3 | `searchMemory` returns the same-axis memory with similarity ≈ 1 and all aliased fields typed (`number`, `Date`); other-axis memory excluded by `minScore`. |
| 4 | Ranking: same similarity, older `last_accessed_at` (set by raw `UPDATE`) or lower `initial_score` ranks lower; keyword match raises `finalScore`. |
| 5 | `category` / `source` filters; `limit`. |
| 6 | Only returned rows get `lastAccessedAt` refreshed. |
| 7 | Row without embedding is never returned. |
| 8 | `listMemories` filters and paging; `deleteMemory` → linked `chat_messages.memory_id` becomes null; unknown ID → 404. |
| 9 | `RagChunkService.syncEmailToMemory` smoke: long body → one memory plus more than one `rag_chunks` row; unknown ID → `null`. |

### 5.7 `chat.int-spec.ts` (step 7)

`ChatSessionService`

| # | Case |
|---|------|
| 1 | `resolve` without ID creates a session with the title cut at 80 characters; with another user's ID → 404; unknown ID → 404. |
| 2 | `appendMessage` stores the row and advances `lastMessageAt`. |
| 3 | `recentHistory`: oldest first, excludes the cursor message, respects `limit`, drops empty content, starts at a user turn. |
| 4 | `listSessions` ordered by `lastMessageAt`, scoped to the user; `listMessages` paging and ownership. |
| 5 | `deleteSession` cascades messages and keeps the linked memory; other user's session → 404 and nothing deleted. |

`AgentService` (scripted fake chat)

| # | Case |
|---|------|
| 6 | Plain text turn: frames `session`, `text`, `done`; USER and MODEL rows stored; second turn on the same session sends the first turn as history (fake). |
| 7 | Unknown or foreign `sessionId` → rejects with 404 before any model call, nothing stored. |
| 8 | Read tool (`get_financial_summary`) runs against seeded accounts; MODEL row `toolCalls` holds the result as plain JSON. |
| 9 | Write tool (`create_financial_transaction`) → `confirmation_required`, **no transaction row**; `confirmAction` → row and balance; second `confirmAction` → 404; `discardAction` → nothing written. |
| 10 | Invalid tool arguments → error returned to the model, nothing written. |
| 11 | `save_user_memory` → memory row with `source = CHAT`, linked to the USER message; a second save in the same turn is stored but not linked. |
| 12 | Character: explicit ID, session's character, active character fallback; the persona and `memoryRule` reach the system instruction (fake). Stored memories appear in it. |
| 13 | Model stream throws → `error` frame, USER row kept, no MODEL row. Unsubscribe mid-stream → no MODEL row. |
| 14 | More than `MAX_TOOL_ROUNDS` rounds → `error` frame. |

### 5.8 `proactive.int-spec.ts` (step 8)

| # | Case |
|---|------|
| 1 | `handleFallbackCron`: event starting in 10 minutes → Telegram (fake) called, `remindedAt` set; a second run sends nothing. |
| 2 | Event in 20 minutes, event already started, soft-deleted event → not sent. |
| 3 | Telegram `FAILED` → `remindedAt` stays null and the next run retries. |
| 4 | `TtsService.textToSpeech` (fake `fetch`): no `voiceId` → uses the active character's voice; no active character → default voice from config. |

## 6. Order of work

| Step | Content | Gate |
|------|---------|------|
| 1 | Section 4 + character smoke test | `npm run test:int` green, `npm test` still 114 |
| 2 | Finance | |
| 3 | Auth, character | |
| 4 | Calendar + sync | |
| 5 | Email (rules, ingest, processor, Gmail push) | |
| 6 | Memory | |
| 7 | Chat + agent | |
| 8 | Proactive, TTS, docs | `npm run lint`, both suites green |

One commit per step. A test that exposes a bug is committed as `it.fails(...)` with a one-line comment naming the
finding, not by changing `src/`.

## 7. Risks

- **Wrong database.** The suite truncates. Two guards: name check in `global-setup.ts` and in `resetDb`.
- **Real keys from `server/.env`.** Mitigated by 4.1 plus the `fetch` stub. Must be confirmed in step 1.
- **`compile()` without `init()`.** If a provider turns out to need `onModuleInit` (only `AgentService` and
  `PrismaService` have one today), call that hook by hand in the harness; do not call `init()`.
- **Concurrency cases** (5.1 #2, 5.2 #6, 5.3 #3, 5.5 #6) can be flaky if they assert on which call wins. Assert only
  on the final database state.
- **Time-based cases** (5.6 #4, 5.8) set timestamps in the database relative to `now()`; no fake timers, because
  Postgres `NOW()` ignores them.
