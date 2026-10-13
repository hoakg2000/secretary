# Secretary — Documentation & Server Review

**Date:** 2026-10-13 (revision 2; first version 2026-10-12)
**Scope:** everything under `documents/` and `server/` (source, Prisma schema, migration, config). `web-client/` and `mobile-client/` are empty; `fish-tts-api/` and root `src/` were only skimmed.
**Method:** full read of docs and source, plus `tsc --noEmit` (passes) and `vitest run` (10 of 12 spec files fail). Nothing was run against a live database, Redis, Gemini or Google, so runtime findings are from reading the code unless stated.
**Revision 2:** reorganised by module, and updated after an independent review of the gap analysis. That review confirmed every gap, corrected four entries, and added the items marked *(added in review)*. Two claims from the first version were wrong and are fixed here: that the `.mermaid.live` files match the code (DOC-1), and that TTS returns upstream error text to the client (AI-I14).

**How to read this.** Each module section has four parts:

- **Issues** — bugs and security problems in code that exists.
- **Gaps** — documented but not built (or built but not documented).
- **Doc mismatches** — where the documents and the code disagree.
- **Recommendations** — each tagged **P0** (do now), **P1** (before wiring real data), **P2** (later).

Every item has an ID (`AUTH-I1`, `EMAIL-G2`, `FIN-D3`, `CAL-R1` …) so a plan can reference it. Paths are relative to `server/` for code and `documents/` for docs.

---

## 1. Summary

The documents describe a finished system; the server is roughly a first-pass scaffold of it. CRUD for characters, email rules, finance and local calendar exists and compiles. The parts that make the product what the summary says it is — Gmail ingestion, AI email classification, two-way calendar sync, Telegram alerts, the memory decay job, the proactive agent — are stubs or absent.

| # | Finding | ID | Why it matters |
|---|---------|----|----------------|
| 1 | Most server code is not committed anywhere | REPO-I1 | `server/` is a nested git repo with one commit and no remote; six module folders are untracked. A disk failure loses the work. |
| 2 | `CharacterController` has no auth guard | CHAR-I1 | Anyone who can reach the server can rewrite the AI's system prompt. |
| 3 | Email webhook is unauthenticated and takes a pre-parsed email | EMAIL-I1 | Anyone can inject fake "bank" emails. Harmless today only because the worker does nothing with them. |
| 4 | Google OAuth callback is unguarded with no `state` | AUTH-I3 | An attacker can link *their* Google account to the master user. |
| 5 | A refresh token works as an access token | AUTH-I1 | Same secret, same payload, no type claim — a 7-day bearer token that survives logout. |
| 6 | No way to create the master user | AUTH-G1 | No seed, no register endpoint. Login cannot succeed on a fresh database. |
| 7 | Chat endpoint is unreachable from a browser | AI-I1 | `@Sse` registers a `GET`, but the handler reads `@Body()`. |
| 8 | Memory save/search will fail on first call | AI-I8 | `text-embedding-004` returns 768 dimensions; the column is `vector(1536)`. `GEMINI_API_KEY` is also not in `.env`. |
| 9 | Cached balance is updated read-modify-write outside the transaction | FIN-I1 | Concurrent writes lose updates; the docs claim this is race-free. |
| 10 | Docs and code disagree on almost every route | DOC-2 | A client built from `endpoint.md` will get 404s. |

Item counts: Repository 3 issues · Auth 10 issues, 4 gaps · Character 3 issues · Email 9 issues, 8 gaps · Finance 7 issues, 5 gaps · Calendar 6 issues, 6 gaps · AI agent 15 issues, 8 gaps · Proactive 4 issues, 3 gaps · Server-wide 6 issues.

---

## 2. Repository and project setup

### Issues

- **REPO-I1 — Uncommitted server code.** `git -C server status` shows six untracked module directories (`ai-agent`, `calendar`, `common`, `email`, `finance`, `proactive`) and modified `app.module.ts` / `package.json`. `git -C server remote -v` is empty. The parent records `server` as a gitlink (mode 160000) with no `.gitmodules`, so a fresh clone of the GitHub repo gets an empty `server/` folder. The parent's "add finance/calendar/ai agent module" commits contain docs only.
- **REPO-I2** — `documents/output.txt` (276 KB, UTF-16 dump of the other docs) is committed.
- **REPO-I3** — `server/README.md` is the unmodified Nest starter.

### Gaps

- **REPO-G1 — Clients.** `summary.md:3,51` describes a Next.js dashboard and a React Native app; `web-client/` and `mobile-client/` are empty directories.
- **REPO-G2** *(added in review)* — `server/docker-compose.yml` (pgvector Postgres plus Redis) exists but no document mentions it or any local setup.

### Recommendations

- **REPO-R1 (P0)** — Commit and push the server code. Simplest: delete `server/.git`, `git rm --cached server` in the parent, then `git add server` so it becomes ordinary files in the one repo. If a separate repo is wanted, give it a remote and add a proper `.gitmodules`.
- **REPO-R2 (P2)** — Remove `documents/output.txt`; replace `server/README.md` with real run instructions (docker compose, migrate, seed, start).
- **REPO-R3 (P2)** — Mark the clients as **Planned** in `summary.md` until work starts.

---

## 3. Auth

### Issues

- **AUTH-I1 — Refresh token accepted as access token.** `src/auth/auth.service.ts:56-62` signs both with the same secret and payload; `jwt.strategy.ts` checks only signature and expiry.
- **AUTH-I2 — Access tokens are never checked against the session.** `JwtStrategy.validate` does not look up `user_sessions` or `users.is_active`, so logout does not invalidate an access token (or, per AUTH-I1, the refresh token used as one).
- **AUTH-I3 — OAuth callback** (`auth.controller.ts:180`) has no guard and no `state` parameter; `handleGoogleCallback` falls back to `user.findFirst()` (`auth.service.ts:260`).
- **AUTH-I4 — Google tokens stored in plaintext** (`auth.service.ts:276-279`). `db.md`, `auth.controller.md` and `auth.service.md` all say encrypted.
- **AUTH-I5 — Hard-coded fallback secret** `'defaultSecretKey'` in `auth.module.ts:17`, `jwt.strategy.ts:19`, `auth.service.ts:97`. A missing env var silently yields forgeable tokens.
- **AUTH-I6 — No refresh rotation or replay detection**, though `auth.controller.md` says there is.
- **AUTH-I7 — Expiry mismatch.** DB `expiresAt` and cookie `maxAge` are hard-coded to 7 days (`auth.service.ts:66-67`, `auth.controller.ts:57`) while the JWT uses `JWT_REFRESH_EXPIRES_IN`.
- **AUTH-I8 — Logout without a cookie revokes every refresh token** (`auth.service.ts:150-155`). A mobile client that sends the refresh token in the body cannot pass it to logout, so logging out on mobile logs out the web session too.
- **AUTH-I9** — `login` does not check `isActive`. `x-forwarded-for` is trusted as-is. No rate limiting on login.
- **AUTH-I10** — `POST /refresh` is annotated `@ApiBearerAuth` with a summary copy-pasted from the session endpoint.

### Gaps

- **AUTH-G1 — No way to create the master user.** `db.md:9` assumes the user exists. There is no seed script, no `prisma.seed` entry in `package.json`, and no register route (controller routes: login, refresh, logout, session, google/connect, google/callback). The docs never describe the bootstrap either.
- **AUTH-G2 — Google token lifecycle.** Refreshed Google tokens are never persisted and `users.google_token_expires_at` is written (`auth.service.ts:280`) but never read. The `googleapis` client probably refreshes in memory during calendar sync (library behaviour, not tested).
- **AUTH-G3 — `deviceId`.** Documented in the login request and session response; `UserSession.deviceId` is never written (`auth.service.ts:47-53`).
- **AUTH-G4** *(added in review)* — `LogoutDto.sessionId` for ending one specific session (`modules/auth/auth.controller.md:58-59`) is not accepted (`auth.controller.ts:90-97`).

### Doc mismatches

- **AUTH-D1 — Login contract.** Docs say `username`, `deviceId`, and a response with `tokenType` / `expiresIn` / `session`. Code takes `email` and returns `accessToken` + `user`. The refresh response likewise lacks `tokenType` and `expiresIn` (`auth.service.ts:139`).
- **AUTH-D2** — Code requests an extra OAuth scope, `userinfo.email` (`auth.service.ts:225`), not in the docs.
- **AUTH-D3** — `modules/log.md` still lists `GET /email/google/connect` and `/callback` under the Email module, contradicting the note in `email.controller.md` that Auth owns them.

### Recommendations

- **AUTH-R1 (P0)** — Fail startup if `JWT_SECRET` is missing; delete the `'defaultSecretKey'` fallbacks. (See SRV-R1 for the config schema.) → AUTH-I5
- **AUTH-R2 (P0)** — Give refresh tokens a separate secret or a `typ` claim and reject them in `JwtStrategy`. Look up the session row and `isActive` in `validate`. → AUTH-I1, I2, I9
- **AUTH-R3 (P0)** — Add a signed `state` to the Google OAuth flow that carries the user ID, verify it in the callback, and remove the `findFirst()` fallback. → AUTH-I3
- **AUTH-R4 (P0)** — Add a seed script (`prisma db seed`) that creates the master user from env variables, and document it. → AUTH-G1
- **AUTH-R5 (P1)** — Encrypt Google tokens at rest (AES-GCM, key from env); persist refreshed tokens and use `google_token_expires_at`. → AUTH-I4, AUTH-G2
- **AUTH-R6 (P1)** — Rotate the refresh token on every refresh and revoke the session on replay; derive DB expiry and cookie `maxAge` from `JWT_REFRESH_EXPIRES_IN`. → AUTH-I6, I7
- **AUTH-R7 (P1)** — Let logout take the refresh token (or `sessionId`) in the body and revoke only that session. → AUTH-I8, AUTH-G4
- **AUTH-R8 (P2)** — Throttle `/auth/login`; set `trust proxy` explicitly; fix the Swagger annotations on `/refresh`; decide whether `deviceId` is wanted and either write it or drop it from docs and schema. → AUTH-I9, I10, AUTH-G3
- **AUTH-R9 (P2)** — Update the auth docs to the real login/refresh contract and remove the stale `log.md` entries. → AUTH-D1..D3

---

## 4. Character

### Issues

- **CHAR-I1 — No `@UseGuards`** on `src/character/character.controller.ts:23-26`. `@ApiBearerAuth()` is also missing the `'JWT-auth'` scheme name, so Swagger does not send the token either.
- **CHAR-I2** — `setActiveCharacter` (`character.service.ts:73-85`) runs two statements without a transaction; the docs say atomic. Nothing in the schema enforces a single active character.
- **CHAR-I3** — Persona update/delete do not check the persona belongs to the character; the docs say they do.

### Gaps

None beyond the route differences below.

### Doc mismatches

- **CHAR-D1 — Routes.**

  | Documented | Actual |
  |-----------|--------|
  | `PUT /characters/:id` | `PATCH /characters/:id` |
  | `PATCH /characters/:id/activate` | `PATCH /characters/:id/active` |
  | `GET /characters/:id/personas` | not present (personas come embedded in the character) |
  | `PUT`/`DELETE /characters/:id/personas/:personaId` | `PATCH`/`DELETE /characters/personas/:personaId` |
  | — | `GET /characters/:id` (undocumented) |

- **CHAR-D2** — Docs name a `CharacterPersonaService`; the code has only `CharacterService`.
- **CHAR-D3** *(added in review)* — `voiceId` and `source` are required in `modules/character/character.controller.md:41-42` and optional in `src/character/dto/create-character.dto.ts:10-21`.

### Recommendations

- **CHAR-R1 (P0)** — Add `@UseGuards(JwtAuthGuard)` and `@ApiBearerAuth('JWT-auth')`. Better, do SRV-R2 (global guard) so this cannot recur. → CHAR-I1
- **CHAR-R2 (P1)** — Wrap `setActiveCharacter` in `$transaction` and add a partial unique index (`WHERE is_active`) in a migration. → CHAR-I2
- **CHAR-R3 (P1)** — Use the nested route `/characters/:id/personas/:personaId` and filter by both IDs. This also resolves the last row of CHAR-D1. → CHAR-I3
- **CHAR-R4 (P2)** — Align the remaining routes and DTO optionality between docs and code (see DOC-R2 for the direction). → CHAR-D1..D3

---

## 5. Email

### Issues

- **EMAIL-I1 — Webhook is open and takes the wrong payload.** `src/email/email.controller.ts:52` has no guard and expects `{messageId, sender, subject, rawBody}`. Google Pub/Sub sends `{message: {data: base64}, subscription}` containing only a history ID.
- **EMAIL-I2 — Dedup is check-then-insert** (`email.service.ts:29-51`). Two concurrent deliveries both pass the check; the loser gets a unique-constraint 500, and Pub/Sub retries.
- **EMAIL-I3 — `dedupHash` adds nothing**: it hashes `messageId + body`, and `messageId` is already unique. It will not catch the stated use case — the same email forwarded from several secondary addresses, each with a different Message-ID.
- **EMAIL-I4 — Rules cannot be disabled through the API**: `CreateEmailRuleDto` has no `isActive`, and the global `whitelist: true` strips it.
- **EMAIL-I5 — Worker does not process anything** (`email.processor.ts:48-71`): moneylist and whitelist emails are marked `PROCESSED` with a TODO (`:60`, `:66`). Unmatched emails are marked `SKIPPED`; the docs say they go to the AI at normal priority.
- **EMAIL-I6** — First matching rule wins by creation date, so an older whitelist rule beats a newer blacklist rule.
- **EMAIL-I7** — User-supplied regex is compiled and run per job with no validation at creation and no timeout (ReDoS).
- **EMAIL-I8** — Jobs are added with no options (`email.controller.ts:67-73`): no `attempts`, `backoff`, `removeOnComplete` or `jobId`.
- **EMAIL-I9** — The processor's catch block does its own DB update (`email.processor.ts:86-89`), which can throw and mask the original error.

### Gaps

- **EMAIL-G1 — Gmail ingestion.** Documented: Pub/Sub push, Gmail `watch`, history and message fetch (`summary.md:9`, `modules/email/email.service.md:17-19`, `email.controller.md:14-17`). In code: no Gmail or Pub/Sub call anywhere in `src/`.
- **EMAIL-G2 — Log endpoints.** `GET /email/logs` and `POST /email/logs/:id/reprocess` (`endpoint.md:35-36`) do not exist.
- **EMAIL-G3 — AI processing.** Documented: classification into three categories, a banking extraction prompt, priorities 1/2/3 (`modules/email/email.worker.md:16-48`). In code: rule matching only.
- **EMAIL-G4 — Pre-filtering runs in the wrong place** *(added in review)*. Docs: rules are evaluated at ingestion; blacklisted mail is saved as `SKIPPED` and never enqueued; priority is set at enqueue (`email.service.md:23-27`, `email.controller.md:19-22`). Code: every email is enqueued and rules run in the worker (`email.processor.ts:29-45`). Priorities cannot be added without moving this.
- **EMAIL-G5 — Worker configuration and job tracking** *(extended in review)*. Docs: `BULLMQ_CONCURRENCY` (default 3), 120 s timeout, remove-on-fail 50, and active/completed/failed hooks that write `queue_jobs` (`email.worker.md:21-26,69-121`). Code: `@Processor('email-processing')` with no options and no `@OnWorkerEvent` (`email.processor.ts:15-16`); the `QueueJob` model is never referenced.
- **EMAIL-G6 — Alerts.** Telegram bot with inline buttons and push notifications (`summary.md:23`, `email.worker.md:46`) are not built, and nothing in the email module calls `ProactiveService`, so the email-to-alert path is not even stubbed. See also PRO-I1.
- **EMAIL-G7 — Rule `type` filter** *(added in review)*. Documented at `endpoint.md:40`; `findAllRules` takes no query (`email.controller.ts:106-109`).
- **EMAIL-G8 — Schema.** `email_logs.ai_summary`, `queue_jobs.status` and `queue_jobs.completed_at` are referenced by `email.worker.md` and do not exist in `prisma/schema.prisma`.

### Doc mismatches

- **EMAIL-D1 — Routes.**

  | Documented | Actual |
  |-----------|--------|
  | `POST /email/webhooks/google-pubsub` | `POST /email/webhook` |
  | `/email/rules…` with `PUT` | `/email-rules…` with `PATCH` |
  | — | `GET /email-rules/:id` (undocumented) |

- **EMAIL-D2 — `email.worker.md` describes the wrong library**: `@Process()`, `@OnQueueActive()`, `@OnQueueCompleted()`, `@OnQueueFailed()` are `@nestjs/bull` decorators. The project uses `@nestjs/bullmq` (`WorkerHost` + `@OnWorkerEvent`).
- **EMAIL-D3** — Queue name is `email-processing-queue` in docs, `email-processing` in code. Class is `EmailBullmqProcessor` in docs, `EmailProcessor` in code.
- **EMAIL-D4 — Docs disagree with each other** *(corrected in review)*. `email.worker.md:37` says `attempt_count` and `payload_snapshot`; `db.md:37` and the schema say `retry_count` and `payload`. `db.md:26` omits the `FAILED` status that `email.worker.md:48` and the schema both have. `queue_jobs.queue_name` exists in the schema but in no document.
- **EMAIL-D5** — `email-flow.mermaid.live:29` shows Google Pub/Sub posting the hand-made payload, which it cannot do, and the file contains leftover `[cite: 1]` markers that will render in the diagram.

### Recommendations

- **EMAIL-R1 (P1)** — Webhook: verify the Pub/Sub OIDC token (or a shared secret), accept the real envelope, and fetch the message through the Gmail API. Until that is built, put the current test endpoint behind `JwtAuthGuard`. → EMAIL-I1, EMAIL-G1
- **EMAIL-R2 (P1)** — Replace check-then-insert with insert-and-catch `P2002` returning 200. Hash a normalised body alone if forwarded duplicates must be caught. → EMAIL-I2, I3
- **EMAIL-R3 (P1)** — Move rule evaluation to ingestion as documented: save blacklisted mail as `SKIPPED` without enqueueing and set the job priority there. Define a rule precedence (blacklist first) instead of creation order. → EMAIL-G4, EMAIL-I6
- **EMAIL-R4 (P1)** — Queue options: `attempts`, exponential `backoff`, `removeOnComplete` / `removeOnFail`, and the email log ID as `jobId`. Add worker concurrency from config. → EMAIL-I8, EMAIL-G5
- **EMAIL-R5 (P1)** — Add `isActive` to the rule DTOs; validate regex on create/update (use `re2` or a length and complexity limit). → EMAIL-I4, I7
- **EMAIL-R6 (P1)** — Decide **build or de-scope** for AI classification, banking extraction and alerts. If built, add `ai_summary`, implement the `@OnWorkerEvent` hooks, and either add the missing `queue_jobs` columns or drop the table (BullMQ already keeps job state in Redis). → EMAIL-I5, EMAIL-G3, G5, G6, G8
- **EMAIL-R7 (P2)** — Add `GET /email/logs` and reprocess, and the rule `type` filter, or mark them Planned. → EMAIL-G2, G7
- **EMAIL-R8 (P2)** — Rewrite `email.worker.md` for BullMQ, settle the column names and statuses between `db.md` and `email.worker.md`, fix the flow diagram. → EMAIL-D1..D5

---

## 6. Finance

### Issues

- **FIN-I1 — Lost-update race on `cachedBalance`.** `createTransaction` reads the balance, computes in JS, and writes an absolute value (`src/finance/finance.service.ts:154-157`, `180-183`); the read is outside `$transaction`. Same in `deleteTransaction` (`248-267`). Amounts go through `Number()`, so `Decimal(18,2)` precision is lost too.
- **FIN-I2 — AI tools bypass validation.** `aiCreateTransaction` (`finance.service.ts:346-368`) calls `createTransaction` directly, so the `ValidationPipe` rules do not apply: a negative amount reverses the sign of the balance change, and an unparseable date becomes `Invalid Date`.
- **FIN-I3** — `PATCH /accounts/:id` accepts `cachedBalance` via `PartialType`, silently overwriting the balance with no audit trail. (This is the unsafe stand-in for the missing endpoint in FIN-G1.)
- **FIN-I4** — `getTotalBalance` (`finance.service.ts:83-91`) sums all currencies and labels the result VND.
- **FIN-I5** — Deleting a bank account cascades to all its transactions.
- **FIN-I6** — A transaction can reference a category of the opposite type, an inactive account, or a non-existent `emailLogId` (FK error surfaces as 500).
- **FIN-I7** — `transactions.email_log_id` is not unique, so a worker retry would create a duplicate transaction once extraction is wired up. `summary.md` promises zero duplicates.

### Gaps

- **FIN-G1 — Missing endpoints** (`endpoint.md:54-63`): update transaction, update category, `PATCH /accounts/:id/balance`, `GET /finance/summary`.
- **FIN-G2 — Missing query features**: pagination on transactions (`finance.service.ts:204-225`) and the category `type` filter (`finance.controller.ts:141-142`).
- **FIN-G3 — AI tool.** Docs define `get_finance_summary(period, month, year)` (`modules/finance/finance.service.md:159-169`); code has `get_financial_summary` with no parameters, returning balances only (`finance.service.ts:276-299`).
- **FIN-G4** *(added in review)* — `getAccounts` is documented as active accounts only; the code returns all (`finance.service.ts:32-36`).
- **FIN-G5 — Schema.** `categories.updated_at` is in the documented responses (`modules/finance/finance.controller.md:265,290,315`) and not in the schema.

### Doc mismatches

- **FIN-D1 — Routes.**

  | Documented | Actual |
  |-----------|--------|
  | `GET /finance/accounts` returns total + list | list only; total is at `GET /finance/accounts/total-balance` |
  | `PUT /finance/accounts/:id` | `PATCH` |
  | `GET /finance/transactions` (paginated) | `POST /finance/transactions/search` (unpaginated) |
  | — | `GET`/`DELETE /finance/accounts/:id`, `GET /finance/transactions/:id` (undocumented) |

- **FIN-D2 — Field names** *(added in review)*. `initialBalance` in docs versus `cachedBalance` in code (`finance.controller.md:45`, `dto/create-bank-account.dto.ts:41`); `emailLogReferenceId` versus `emailLogId` (`finance.controller.md:156`, `dto/create-transaction.dto.ts:78`). `categoryId` and `currency` are required in docs, optional in code.
- **FIN-D3** — Docs claim balance updates are race-free; see FIN-I1.

### Recommendations

- **FIN-R1 (P1)** — Balances: use `{ increment }` / `{ decrement }` with `Prisma.Decimal` inside the transaction; never compute in JS with `Number()`. → FIN-I1
- **FIN-R2 (P1)** — Validate AI tool input by running the DTO through `validateOrReject` before calling the service (see AI-R3 for the wrapper). → FIN-I2
- **FIN-R3 (P1)** — Remove `cachedBalance` from the update DTO and add the documented `PATCH /accounts/:id/balance`, recording the adjustment as a transaction. → FIN-I3, FIN-G1
- **FIN-R4 (P1)** — Add a unique constraint on `transactions.email_log_id`. → FIN-I7
- **FIN-R5 (P1)** — Integrity checks in `createTransaction`: category type matches transaction type, account is active, `emailLogId` exists (return 400/404, not 500). Change the account delete to restrict or soft-delete. → FIN-I5, I6
- **FIN-R6 (P2)** — Group `getTotalBalance` by currency. → FIN-I4
- **FIN-R7 (P2)** — Build or mark Planned: update transaction/category, `GET /summary`, pagination, category filter, the parameterised summary tool, `categories.updated_at`. → FIN-G1..G5
- **FIN-R8 (P2)** — Align routes and field names between docs and code. → FIN-D1, D2

---

## 7. Calendar

### Issues

- **CAL-I1 — Deleting an event never deletes it on Google.** The local row and its sync state are hard-deleted, leaving nothing for the sync job to act on.
- **CAL-I2 — Edits made during a sync are lost**: the job reads the event, calls Google, then sets `SYNCED` unconditionally.
- **CAL-I3 — Insert is not idempotent**: if `events.insert` succeeds but the DB update fails (or two instances run the cron), the next cycle creates a duplicate Google event.
- **CAL-I4** — `events.update` is a full replace, and attendees are never sent, so attendees or fields added in Google are wiped.
- **CAL-I5** — A remotely deleted event (404/410) is retried every 5 minutes forever.
- **CAL-I6** — `toDate` is documented as "events ending before" but filters on `startTime`. Nothing validates `endTime > startTime`.

### Gaps

- **CAL-G1 — One-way sync.** Docs describe two-way sync with pull from Google (`modules/calendar/calendar.service.md:94-123`). Code only pushes (`src/calendar/calendar-sync.service.ts:47-112`).
- **CAL-G2 — Manual sync.** `POST /calendar/sync` (`endpoint.md:71`) does not exist.
- **CAL-G3 — Conflict handling.** No `If-Match` on updates (`calendar-sync.service.ts:74-78`); `SyncStatus.CONFLICT` is never set; `calendar_sync_states.etag` is written (`:84,100`) but never read.
- **CAL-G4 — Immediate sync** *(added in review)*. Docs: create and update trigger a sync attempt straight away (`calendar.service.md:35,59-61`). Code: marks `DIRTY` and waits for the cron (`calendar.service.ts:80-84,206-214`).
- **CAL-G5 — Cron configuration.** Docs: `CALENDAR_AUTO_SYNC_CRON`, default 15 minutes (`calendar.service.md:123`). Code: hard-coded 5 minutes (`calendar-sync.service.ts:117`); the env var is never read.
- **CAL-G6** *(added in review)* — Docs promise sync counts and graceful backoff (`calendar.service.md:121-122`); code logs start, finish and per-event errors only.

### Doc mismatches

- **CAL-D1 — Routes.**

  | Documented | Actual |
  |-----------|--------|
  | `/calendar/events…` with `PUT`, `startDate`/`endDate` | `/calendar…` with `PATCH`, `fromDate`/`toDate` |
  | — | `GET /calendar/:id` (undocumented) |

- **CAL-D2** — `db.md` writes `calendar_sync_state` in the table and `calendar_sync_states` below.
- **CAL-D3** — No document for `CalendarSyncService`.

### Recommendations

- **CAL-R1 (P1)** — Soft-delete events (a `DELETED` sync state) so the sync job can remove them from Google, then purge. → CAL-I1
- **CAL-R2 (P1)** — Send a client-generated event `id` on insert so retries are idempotent. → CAL-I3
- **CAL-R3 (P1)** — Mark `SYNCED` only if the event's `updatedAt` is unchanged since it was read. → CAL-I2
- **CAL-R4 (P1)** — Use `events.patch` with `If-Match` from the stored ETag; set `CONFLICT` on 412; treat 404/410 as remotely deleted and stop retrying. → CAL-I4, I5, CAL-G3
- **CAL-R5 (P2)** — Validate `endTime > startTime`; fix or re-document the `toDate` semantics. → CAL-I6
- **CAL-R6 (P2)** — Decide **build or de-scope** for pull sync, `POST /calendar/sync` and immediate sync. Read the cron from config. → CAL-G1, G2, G4, G5, G6
- **CAL-R7 (P2)** — Align routes and parameter names; document `CalendarSyncService`. → CAL-D1..D3

---

## 8. AI agent (chat, tools, memory, RAG, TTS)

### Issues — chat and tools

- **AI-I1 — `@Sse('chat/stream')` + `@Body()`** (`src/ai-agent/ai-agent.controller.ts:74-75`). `@Sse` is a `GET` route (confirmed in `node_modules/@nestjs/common/decorators/http/sse.decorator.js`). `EventSource` cannot send a body, so validation rejects the request. **Everything else under "chat" is unreachable until this is fixed.**
- **AI-I2 — Not streaming**: `chat.sendMessage` returns the whole answer, emitted as one `text` frame (`services/agent/agent.service.ts:196-203`).
- **AI-I3 — Infinite loop on an unknown tool**: if Gemini returns a function call whose name is not in `toolsMap`, `response` is never replaced and the `while` never exits. There is no iteration cap either.
- **AI-I4 — Tools are called with one argument object** (`tool.instance[methodName](call.args)`), but `updateEvent(id, dto)` and `deleteEvent(id)` take positional arguments. `update_calendar_event` and `delete_calendar_event` therefore cannot work.
- **AI-I5** — Multiple function calls in one model turn are answered one at a time while iterating the stale list; Gemini expects all responses for a turn together. Likely to error — not tested.
- **AI-I6** — A tool that throws aborts the whole chat instead of being reported back to the model.
- **AI-I7 — Design risk.** Email text is meant to flow into memory, and memory is fed to a model that can create transactions, delete events and send notifications without confirmation. That is a prompt-injection path from any inbound email to the ledger.

### Issues — memory

- **AI-I8 — Embedding dimension**: `text-embedding-004` returns 768 values; `ai_memories.embedding` is `vector(1536)`. I also believe Google has retired that model — verify, and move to `gemini-embedding-001` with `outputDimensionality: 1536`.
- **AI-I9 — No vector or full-text index.** The migration creates only unique indexes; `db.md` claims HNSW.
- **AI-I10 — Hybrid score is effectively vector-only**: `ts_rank` values are typically far below cosine similarity, so the 0.3 weight contributes little.
- **AI-I11 — Search always returns the top N, however irrelevant, and then refreshes their `last_accessed_at`** (`services/memory/memory.service.ts:99-105`), so unrelated memories stop decaying.
- **AI-I12** — `SearchMemoryDto.limit` has no upper bound.

### Issues — TTS

- **AI-I13** — TTS buffers the whole MP3 (docs say streaming), sends `Bearer undefined` when the key is missing, and sends an empty `reference_id` when no voice is set.
- **AI-I14** *(corrected)* — The upstream Fish.audio error body is logged, not returned (`services/tts/tts.service.ts:48-56`). The outer catch does return `error.message` for any other failure (`:60-64`), so internal error text such as network errors can reach the client.

### Issues — dead code

- **AI-I15 — `RagChunkService` is never called.** It is referenced only in its own file and the module (`ai-agent.module.ts:6,16,23`). It writes `rag_chunks` (`services/rag-chunk/rag-chunk.service.ts:35`) and nothing reads that table.

### Gaps

- **AI-G1 — Conversation state.** Docs: memory retrieved before each turn, a `sessionId`, history (`modules/ai/ai.service.md:33,37`, `ai.controller.md:21`). Code: a new chat per request with no memory lookup (`agent.service.ts:131-148`); `ChatStreamDto` has no `sessionId`. Retrieval happens only if the model chooses to call the search tool.
- **AI-G2 — Memory CRUD.** `GET` / `PUT` / `DELETE /memories` (`endpoint.md:84-87`) do not exist; only create and search (`ai-agent.controller.ts:41,56`). `query` is optional in the docs (list mode) and required in code, so memories cannot be listed at all.
- **AI-G3 — Search filters.** `source` and `minScore` (`ai.controller.md:53-58`) are not in `SearchMemoryDto`.
- **AI-G4 — Decay job.** Docs: a decay cron, `memory_decay_logs`, pruning below 0.10 (`ai.service.md:178-190`). Code: decay is computed at query time only (`queries/memory.queries.ts:59`) — so it is partly built — but there is no cron, no pruning, and `MemoryDecayLog` is never referenced.
- **AI-G5** *(added in review)* — Docs say search writes access events to `memory_decay_logs` (`ai.service.md:82`); code only updates `lastAccessedAt`.
- **AI-G6** *(added in review)* — Docs say memories can be "disabled" or "deactivated" (`ai.service.md:146,180`); `ai_memories` has no active flag.
- **AI-G7 — RAG pipeline** *(corrected in review)*. Docs: chat turns are chunked and facts extracted (`ai.service.md:36`). Code: nothing chunks chat turns; the dead `RagChunkService` handles only emails and transactions. (An earlier version of this report called the lack of an embedding column on `rag_chunks` a gap; no document asks for one, so it is a design question, not a gap.)
- **AI-G8 — Tool set.** See AI-D2: three of the five documented tools exist under other names, and five undocumented tools exist.

### Doc mismatches

- **AI-D1 — Routes.**

  | Documented | Actual |
  |-----------|--------|
  | `/ai/chat/stream` (POST) | `/ai-agent/chat/stream` (GET) |
  | `/ai/tts/stream` | `/ai-agent/tts` |
  | `GET /ai/memories` | `POST /ai-agent/memories/search` |

- **AI-D2 — Tools.** Docs list 5 (`get_finance_summary`, `get_calendar_events`, `create_calendar_event`, `search_ai_memories`, `create_ai_memory`). Code registers 10: `get_financial_summary`, `create_financial_transaction`, `search_financial_transactions`, `create_calendar_event`, `get_calendar_events`, `update_calendar_event`, `delete_calendar_event`, `search_semantic_memory`, `save_user_memory`, `send_proactive_notification`.
- **AI-D3 — Names.** Docs use `AiService`, `AiToolRegistryService`, `src/shared/decorators/`. Code has `AgentService` / `MemoryService` / `TtsService` / `RagChunkService`, no registry service, and `src/common/decorators/`.
- **AI-D4 — Search configuration.** Docs say `'english'` and `ts_rank_cd`; code uses `'simple'` and `ts_rank`. For Vietnamese content `'simple'` is the better choice — fix the docs, not the code. Decay default is 0.05 in docs, 0.01 in code and schema.
- **AI-D5 — Embedding size** is written as "1536 or 3072" throughout; the schema fixes 1536 and the model produces 768.
- **AI-D6** — `summary.md` names "OpenAI / Anthropic LLM APIs"; the code is Gemini.
- **AI-D7** — `configs/AiTool-Decorator.md` is corrupted: the English version is pasted inside the first code fence of the Vietnamese version, so the header, interface and description each appear twice.
- **AI-D8** *(corrected)* — `ai-flow.mermaid.live` does not match the code: line 49 shows `POST /chat/stream`, line 76 a 1536-dimension vector, and lines 83-86 show Email and Finance feeding `RagChunkService`, which is never called. Memory source `'TRANSACTION'` (`rag-chunk.service.ts:114`) is outside the documented CHAT/EMAIL/MANUAL set.
- **AI-D9** — No documents for `RagChunkService` or `TtsService`.

### Recommendations

- **AI-R1 (P1)** — Chat transport: change to `@Post` and write the SSE response manually (or `GET` with query parameters); use `sendMessageStream`. → AI-I1, I2
- **AI-R2 (P1)** — Tool loop: cap iterations; answer unknown tools and thrown errors with an error function response; send all function responses for a turn together. → AI-I3, I5, I6
- **AI-R3 (P1)** — Put a small wrapper per tool between the model and the services, instead of calling service methods directly. The wrapper maps the argument object to the method signature and validates it against a DTO. → AI-I4, FIN-I2
- **AI-R4 (P1)** — Embeddings: pick one model and dimension, align the column, and add HNSW (`vector_cosine_ops`) and GIN (`content_tsv`) indexes in a migration. → AI-I8, I9
- **AI-R5 (P1)** — Search: add a minimum-similarity cut-off and only then touch `last_accessed_at`; cap `limit`; normalise or re-weight the text score. → AI-I10, I11, I12, AI-G3
- **AI-R6 (P1)** — Require confirmation for write tools (`create_financial_transaction`, `delete_calendar_event`, `send_proactive_notification`), and treat email-derived text as untrusted when it reaches the model. → AI-I7
- **AI-R7 (P2)** — TTS: fail fast when the key or voice is missing, stream the response, and return a fixed message from the catch block. → AI-I13, I14
- **AI-R8 (P2)** — Decide **build or de-scope**: session state and pre-turn retrieval, memory list/update/delete, decay cron and pruning, RAG chunking. Remove `RagChunkService`, `rag_chunks` and `memory_decay_logs` if de-scoped. → AI-I15, AI-G1..G7
- **AI-R9 (P2)** — Regenerate `AiTool-Decorator.md` cleanly; update the tool list, names, search configuration and flow diagram; document TTS and RAG. → AI-D1..D9

---

## 9. Proactive

### Issues

- **PRO-I1** — `dispatchNotification` only logs (`src/proactive/proactive.service.ts:56-74`), then returns `status: 'SENT'`.
- **PRO-I2 — Duplicate reminders**: the cron runs every 10 minutes and looks 15 minutes ahead with no "already reminded" marker (`proactive.service.ts:80-110`), so many events are announced twice.
- **PRO-I3** — `ScheduleModule.forRoot()` is imported in both `AppModule` (`app.module.ts:21`) and `ProactiveModule` (`proactive.module.ts:8`). I recall this causing crons to fire twice in Nest — not confirmed here; removing the second import is safe either way.
- **PRO-I4** — Reminder time is formatted in the server's timezone. There is no timezone setting anywhere in the system.

### Gaps

- **PRO-G1 — No context evaluation** *(corrected in review)*. What exists: the 10-minute reminder cron, a manual trigger endpoint (`proactive.controller.ts:43`) and the `send_proactive_notification` tool (`proactive.service.ts:116-156`). `evaluateAndTrigger` (`:20-43`) just relays a caller-supplied message; nothing decides *whether* to speak.
- **PRO-G2 — Documented triggers** (`summary.md:43-45`, `modules/ai/ai.service.md:161-163,194-197`): the 17:20 daily window and the 3-hour quiet cron do not exist, and no email or calendar code calls the service for an instant trigger.
- **PRO-G3 — Delivery channels.** Telegram and push are not implemented (see EMAIL-G6); no Telegram token or similar is named in the docs or present in `.env`.

### Doc mismatches

- **PRO-D1 — Route.** Docs: `/ai/proactive/trigger` with `{reason}`. Code: `/proactive/trigger` with `{type, message, channel, metadata}`.
- **PRO-D2** — Proactive is documented only inside the AI module docs (`ai.controller.md` §7, `ai.service.md` §7 and §9); it is a separate module in code and has no document of its own. Its trigger and channel enums are undocumented.

### Recommendations

- **PRO-R1 (P1)** — Return an honest status (`LOGGED` or `NOT_CONFIGURED`) until a channel is implemented. → PRO-I1
- **PRO-R2 (P1)** — Record that a reminder was sent (a `reminded_at` column or a small table) and skip events already reminded. → PRO-I2
- **PRO-R3 (P0)** — Remove `ScheduleModule.forRoot()` from `ProactiveModule`. → PRO-I3
- **PRO-R4 (P2)** — Add a user timezone setting and use it for reminder text and the daily window. → PRO-I4
- **PRO-R5 (P2)** — Decide **build or de-scope**: Telegram/push delivery, context evaluation, the daily and quiet triggers. → PRO-G1..G3
- **PRO-R6 (P2)** — Write a Proactive module document with the real route and enums. → PRO-D1, D2

---

## 10. Server-wide (cross-cutting)

### Issues

- **SRV-I1 — Tests**: 10 of 12 spec files fail with "Nest can't resolve dependencies … PrismaService". They are unmodified CLI scaffolds.
- **SRV-I2 — Environment.** `.env` has no `GEMINI_API_KEY`, `FISH_AUDIO_API_KEY`, `FISH_AUDIO_DEFAULT_VOICE_ID` or `CLIENT_URL`, and there is no `.env.example` or config validation. Documented variables `BULLMQ_CONCURRENCY` and `CALENDAR_AUTO_SYNC_CRON` are never read.
- **SRV-I3** — `prisma.config.ts` imports `dotenv/config`, but `dotenv` is not in `package.json` (it resolves only as a transitive dependency).
- **SRV-I4** — No exception filter for Prisma errors, no `helmet`, no throttling, no global prefix (every controller hard-codes `api/v1`).
- **SRV-I5** — Every controller hand-builds `{statusCode, message, data}`; none of the documented response DTOs exist.
- **SRV-I6** — Schema has no indexes on foreign keys or time columns (`transactions.account_id`, `transaction_time`, `local_calendars.start_time`, `email_logs.status`).

### Recommendations

- **SRV-R1 (P0)** — Validate configuration at startup with a Joi/zod schema on `ConfigModule.forRoot`, and add `.env.example` listing every variable. → SRV-I2, AUTH-I5
- **SRV-R2 (P0)** — Register `JwtAuthGuard` as a global `APP_GUARD` and mark the few public routes with a `@Public()` decorator, so new controllers are protected by default. → CHAR-I1, EMAIL-I1
- **SRV-R3 (P2)** — Replace the scaffold spec files with real tests, starting with balance arithmetic, email dedup, and the tool-call loop. → SRV-I1
- **SRV-R4 (P2)** — Add `dotenv` to `package.json`; add `helmet`, a Prisma exception filter, `setGlobalPrefix('api/v1')`, and a response interceptor in place of the hand-built envelopes. → SRV-I3, I4, I5
- **SRV-R5 (P2)** — Add indexes on foreign keys and time columns in a migration. → SRV-I6

---

## 11. Documentation set (applies to all modules)

### Issues

- **DOC-1 — No single source of truth** *(corrected)*. The `*-flow.mermaid.live` files are closer to the code than the `.md` files beside them (they use `AgentService` and the 5-minute cron), but they are not accurate either — see AI-D8 and EMAIL-D5. A reader cannot tell which document is current.
- **DOC-2 — Routes.** Nearly every route differs between `endpoint.md` and the code: `PUT` versus `PATCH`, `/ai` versus `/ai-agent`, `/email/rules` versus `/email-rules`, `/calendar/events` versus `/calendar`. The per-module tables are CHAR-D1, EMAIL-D1, FIN-D1, CAL-D1, AI-D1, PRO-D1.
- **DOC-3** — `endpoint.md` and `log.md` reference a `docs/database/…`, `docs/backend/…`, `docs/ai-memory/…` tree that does not exist; the real folder is `documents/modules/…`.
- **DOC-4** — `summary.md` names "Prisma/TypeORM" and "OpenAI / Anthropic"; the code is Prisma and Gemini.
- **DOC-5** — `db.md` has a broken table header (`_` / `\*` list markers).
- **DOC-6** — No documents for: environment variables, local setup, first-user bootstrap, timezone handling, or the error/response envelope.
- **DOC-7** — Languages are mixed: specs in English, flows and Swagger text in Vietnamese.
- **DOC-8** — The docs present every feature as built. Nothing marks what is implemented, partial or planned.

### Recommendations

- **DOC-R1 (P1)** — Decide which is authoritative. Recommended: treat the Swagger output (`/api/docs`) as the API reference, and reduce the `.md` files to design intent with each section marked **Implemented / Partial / Planned**. → DOC-1, DOC-8
- **DOC-R2 (P1)** — Settle routes before any client work starts: either rename the routes in code to match `endpoint.md` or update the doc to the per-module tables. Pick one direction for all modules. → DOC-2
- **DOC-R3 (P1)** — For every gap marked "build or de-scope" (EMAIL-R6, CAL-R6, AI-R8, PRO-R5, FIN-R7), record the decision in the docs. This is the largest open question in the project: the gaps outnumber the bugs.
- **DOC-R4 (P2)** — Fix the `docs/` paths, the `db.md` table and the `summary.md` technology names; regenerate the flow diagrams from the code once routes are settled. → DOC-3, DOC-4, DOC-5
- **DOC-R5 (P2)** — Add the missing documents: environment variables, setup and bootstrap, timezone policy, response envelope. Choose one language per document type. → DOC-6, DOC-7

---

## 12. Recommendations by priority

All recommendations above, in the order I would do them.

**P0 — do now**

| ID | Action |
|----|--------|
| REPO-R1 | Commit and push the server code |
| SRV-R2 / CHAR-R1 | Global `JwtAuthGuard` with `@Public()`; guard `CharacterController` |
| SRV-R1 / AUTH-R1 | Config validation at startup, no fallback secret, `.env.example` |
| AUTH-R2 | Separate refresh tokens from access tokens; check session in `JwtStrategy` |
| AUTH-R3 | Signed `state` on Google OAuth |
| AUTH-R4 | Seed script for the master user |
| PRO-R3 | Remove the duplicate `ScheduleModule.forRoot()` |

**P1 — before wiring up real data**

| ID | Action |
|----|--------|
| DOC-R1, R2, R3 | Decide the source of truth, the route direction, and build-or-de-scope per gap |
| FIN-R1..R5 | Atomic balances, tool validation, balance endpoint, unique `email_log_id`, integrity checks |
| EMAIL-R1..R6 | Authenticated real webhook, safe dedup, pre-filter at ingestion, queue options, rule DTO, AI processing decision |
| CAL-R1..R4 | Soft delete, idempotent insert, safe `SYNCED`, `patch` with `If-Match` |
| AI-R1..R6 | Chat transport and streaming, tool loop, tool wrappers, embeddings and indexes, search cut-off, write-tool confirmation |
| AUTH-R5..R7 | Token encryption, refresh rotation, per-session logout |
| CHAR-R2, R3 | Atomic activation, persona ownership |
| PRO-R1, R2 | Honest status, reminder dedup |

**P2 — later**

| ID | Action |
|----|--------|
| SRV-R3..R5 | Real tests, hardening, indexes |
| FIN-R6..R8, CAL-R5..R7, AI-R7..R9, PRO-R4..R6, EMAIL-R7, R8, AUTH-R8, R9, CHAR-R4 | Remaining features, per-module doc alignment |
| DOC-R4, R5, REPO-R2, R3 | Doc clean-up and missing documents |

---

## 13. What was and was not verified

- **Run:** `tsc --noEmit` (passes), `vitest run` (10 of 12 spec files fail), `git status` / `git remote` in both repos.
- **Read, not run:** every other finding. No request was sent to the server, and nothing was run against Postgres, Redis, Gemini, Google or Fish.audio.
- **From memory, not confirmed:** that `text-embedding-004` is retired (AI-I8); that a double `ScheduleModule.forRoot()` fires crons twice (PRO-I3); how Gemini handles partial function responses (AI-I5); that the `googleapis` client refreshes tokens in memory (AUTH-G2).
- **From the independent review, not re-checked by the author:** the items marked *(added in review)* and the file and line references in the Gaps sections. AI-I14 was re-read and confirmed.
