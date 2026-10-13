# Secretary — Refactoring Plan

Based on `report.md` (revision 2, 2026-10-13) and a spot-check of that report against `documents/` and `server/`.
Paths are relative to the repository root (`C:\project\secretary`). Report IDs (`AUTH-R2`, `FIN-I1` …) refer to `report.md`.

Nothing in this plan has been executed. No code, document or git state was changed while writing it.

---

## 1. Review of report.md

### What was checked

- Every P0 and P1 recommendation was opened against the cited source file. Files read in full: all of `server/src/auth`, `character`, `email`, `proactive`, `ai-agent`, `finance/finance.service.ts`, `calendar/calendar.service.ts`, `calendar/calendar-sync.service.ts`, `app.module.ts`, `main.ts`, `prisma/schema.prisma`, `prisma.config.ts`, `docker-compose.yml`, plus DTOs and module files. Controllers for finance and calendar were checked for routes and guards only.
- The four "from memory" items in report section 13 were checked against the installed packages in `server/node_modules` and, for the embedding model, one web search.
- Git state of both repositories, the key names in `server/.env` (values not read), the migration SQL, and `documents/summary.md`, `endpoint.md`, `db.md`.
- Not re-checked: the line references inside the per-module docs (`modules/*/*.md`) cited in the Gaps sections, and the `tsc` / `vitest` results (not re-run).

### Verdict

The report holds up. Every P0 and P1 issue that was opened is real at the cited location. The corrections below change how some fixes should be done, not whether they are needed.

### Corrections

| # | Report item | Correction | Evidence |
|---|-------------|------------|----------|
| C1 | AI-R1 "change to `@Post` and write the SSE response manually" | Not necessary. In the installed Nest 12, `@Sse` takes a method option, so the route can be a POST SSE route and keep returning an `Observable`. Behaviour not run here. | `server/node_modules/@nestjs/common/decorators/http/sse.decorator.d.ts:8-10` (`Sse(path?, options?: { [METHOD_METADATA]?: RequestMethod })`) |
| C2 | PRO-I3 "not confirmed" | Supported by the source. Nest's default module key is by object reference, so the two `ScheduleModule.forRoot()` calls produce two module instances, each with its own `ScheduleExplorer`, `SchedulerOrchestrator` and `SchedulerRegistry`; each explorer scans all providers. Every `@Cron` is therefore mounted twice. This also hits the calendar sync cron, which turns CAL-I3 (duplicate Google events) from a rare race into the expected outcome. P0 is right. It is a server-wide item, not a Proactive one. | `server/node_modules/@nestjs/core/injector/container.js:27-33`; `.../opaque-key-factory/by-reference-module-opaque-key-factory.js:15-31`; `server/node_modules/@nestjs/schedule/dist/schedule.module.js` (`forRoot` providers); `server/src/app.module.ts:21`; `server/src/proactive/proactive.module.ts:8` |
| C3 | AI-I3 "the `while` never exits" | Worse than stated. The unknown-tool path contains no `await`, so the loop spins synchronously and blocks the Node event loop: the whole server hangs, not one request. | `server/src/ai-agent/services/agent/agent.service.ts:151-193` |
| C4 | AI-R4 "align the column" | No column change is needed. `embedContent` accepts `config.outputDimensionality`, so the model can be asked for 1536 values to match `vector(1536)`. Only the index migration remains. Staying at 1536 also keeps HNSW usable (pgvector's `vector` HNSW limit is 2000 dimensions — from pgvector's documentation, not verified here). | `server/node_modules/@google/genai/dist/genai.d.ts:4280`; `server/prisma/schema.prisma:262`; `server/src/ai-agent/services/memory/memory.service.ts:36-39` |
| C5 | SRV-R1 "Joi/zod schema" | Neither is a declared dependency (`joi` is not installed; `zod` is present only transitively). `ConfigModule.forRoot` has a `validate` function option, and `class-validator` / `class-transformer` are already dependencies. Use those; add no package. | `server/node_modules/@nestjs/config/dist/interfaces/config-module-options.interface.d.ts:40`; `server/package.json:41-42` |
| C6 | CHAR-I2 / CHAR-R2 name only `setActiveCharacter` | `createCharacter` and `updateCharacter` have the same unguarded deactivate-then-write. All three must be inside the transaction before the partial unique index is added. | `server/src/character/character.service.ts:14-26`, `48-63`, `73-85` |
| C7 | AUTH-R6, AUTH-R7 are described as code changes | Both need a migration. `refresh_tokens` has no link to `user_sessions`, so "revoke only that session" and "revoke the session on replay" cannot be expressed today. | `server/prisma/schema.prisma:46-57`; `server/src/auth/auth.service.ts:69-75`, `142-156` |
| C8 | CAL-R4 "`If-Match` … set `CONFLICT` on 412" | Only sound if there is a way to resolve a conflict. With pull sync de-scoped (see decision D5) a 412 would leave the event stuck: the next local edit still carries the stale ETag. Plan uses `events.patch` without `If-Match` (local wins, Google-side attendees survive because they are not sent) and keeps the 404/410 handling. `If-Match` moves to the backlog together with pull sync. | `server/src/calendar/calendar-sync.service.ts:74-78` |
| C9 | AUTH-G2 "probably refreshes in memory (not tested)" | Confirmed from source, with a detail: the client is built without `expiry_date`, so it never refreshes proactively. Once the stored access token is stale, every sync run sends one request that fails with 401, refreshes, and retries; the new token is discarded when the client is thrown away. | `server/src/calendar/calendar-sync.service.ts:36-39`; `server/node_modules/google-auth-library/build/src/auth/oauth2client.js:303`, `490-493`, `812-816`; `tokens` event at `:211`, `:276` |
| C10 | AI-R6 second half, "treat email-derived text as untrusted" | No code path carries email text to the model today: `RagChunkService.syncEmailToMemory` is never called. The rule belongs to the task that builds email processing (Phase 6), not to Phase 3. The write-tool confirmation half stands. | `server/src/ai-agent/services/rag-chunk/rag-chunk.service.ts:58`; `server/src/email/email.processor.ts:60-66` |

### Structural problems in the report

- **No recommendation:** EMAIL-I9 (catch block masks the original error), AI-G8 (tool set), REPO-G2 (docker-compose undocumented), FIN-D3 (race-free claim). This plan covers them in tasks 2.8, 4.5, 4.8 and 4.5.
- **Duplicates:** AUTH-R1 is part of SRV-R1; CHAR-R1 is part of SRV-R2; FIN-R2 is part of AI-R3; AI-D6 and DOC-4 are the same sentence in `summary.md`; EMAIL-G6 and PRO-G3 are the same missing channel; DOC-2 is the sum of the per-module `-D1` tables. Each pair is one task here.
- **Wrong module:** PRO-I3 / PRO-R3 is server-wide (C2). AUTH-D3 is a defect in `modules/log.md`, a documentation-set item.
- **Priority changes used in this plan:**
  - SRV-I3 (`dotenv` undeclared) moves from P2 to Phase 1: the seed script (AUTH-R4, P0) runs through `prisma.config.ts`, which imports it.
  - The scaffold spec clean-up half of SRV-R3 moves to Phase 0 so that `npm test` is a usable gate for every later commit.
  - EMAIL-R1's Pub/Sub half is deferred; its interim half ("put the test endpoint behind `JwtAuthGuard`") is effectively P0 and falls out of SRV-R2.
  - The regex half of EMAIL-R5 is low risk here (only the authenticated owner can create rules); it is kept because the fix is three lines, without `re2`.
- **IDs:** no recommendation points at an undefined ID.

### Still unverified

- **`text-embedding-004` status.** A web search reports Google's deprecations page listing a shutdown date of 14 January 2026, with `gemini-embedding-001` supporting 3072 / 1536 / 768 dimensions. I read the search summary, not the page. Sources disagree on the retirement date of `gemini-embedding-001` itself, and a newer `gemini-embedding-2` is mentioned as the suggested replacement. Task 3.4 therefore puts the model name in configuration and starts with a one-off manual check.
  Sources: <https://ai.google.dev/gemini-api/docs/deprecations>, <https://developers.googleblog.com/en/gemini-embedding-available-gemini-api/>, <https://discuss.ai.google.dev/t/what-is-the-retirement-date-for-text-embedding-004-model/107445>
- **Gemini and partial function responses (AI-I5).** Not testable without the API. Task 3.2 sends all responses for a turn in one message, which is correct whichever way the API behaves.
- **POST SSE in Nest 12 (C1).** Read from the type declaration only. Task 3.1 has a fallback.
- **Double cron (C2).** Read from source, not observed in a running process.
- **Google Calendar client-supplied event IDs and 409 on re-insert (task 2.11).** From the API documentation as I remember it; not checked.
- **Prisma and hand-written indexes.** I found no partial-index support in the installed Prisma 7.10 but did not test how `migrate dev` treats indexes it cannot represent. See risk R3.
- Nothing was run against Postgres, Redis, Gemini, Google or Fish.audio.

---

## 2. Decisions needed from the owner

Each has a default. Work proceeds on the default unless the owner says otherwise.

| # | Decision | Recommended default | Reason |
|---|----------|---------------------|--------|
| D1 | How to fix the nested `server/` repository | **Flatten into the parent repo.** Back up `server/.git` as a bundle, remove it, replace the gitlink with ordinary files. | `server/` has one commit and no remote; the parent already has the GitHub remote. A submodule adds work for no benefit on a one-person project. |
| D2 | Routes: docs follow code, or code follows docs | **Docs follow code.** Routes change in code only where a fix in this plan changes them anyway (nested persona routes, POST chat, webhook rename). | No client exists yet, Swagger is generated from the code, and the code already uses `PATCH` consistently. |
| D3 | Gmail ingestion and AI classification | **Build, reduced** (Phase 6): poll Gmail on a cron instead of Pub/Sub push; one Gemini call per email for classification and extraction. Pub/Sub push becomes Planned. | It is the first workflow in `summary.md`, so it is core. Polling needs no public endpoint, no Pub/Sub topic and no OIDC verification, and a few minutes of delay is acceptable for one user. |
| D4 | Telegram and push alerts | **Build Telegram text messages only** (Phase 6). De-scope push notifications and inline buttons. | Without one real channel the Proactive module does nothing. Telegram `sendMessage` is one HTTP call. Push needs the mobile client, which does not exist. |
| D5 | Two-way calendar sync | **De-scope pull sync.** Document the calendar as "local is the source of truth, pushed one way to Google". Add `POST /calendar/sync` (it is one call). De-scope immediate sync; keep the cron. | `summary.md` describes the local calendar as a proxy that writes locally first. Pull sync brings conflict resolution with it. |
| D6 | Memory decay job, pruning, `memory_decay_logs` | **De-scope.** Keep the query-time decay that already exists. Drop the table. | The formula in `summary.md` is already applied at query time (`memory.queries.ts:59`). A cron that rewrites scores adds nothing for one user. |
| D7 | RAG chunking | **De-scope.** Delete `RagChunkService`, `rag_chunks`, and the `@langchain/textsplitters` dependency. | Dead code; nothing reads the table; no document specifies retrieval over chunks. |
| D8 | Chat session state | **Build, reduced** (task 3.7): the client sends recent turns in the request; the server retrieves memories before the turn. No server-side session table. | `summary.md` calls the chat conversational and the memory "self-updating"; a chat with no history is neither. Client-held history needs no schema. |
| D9 | Proactive triggers | **Keep the reminder cron only.** De-scope the 17:20 daily window, the 3-hour quiet cron and context evaluation. | Each needs an LLM decision loop and an activity log that do not exist. Revisit once Telegram delivery works. |
| D10 | Web and mobile clients | **Planned.** Out of scope for this plan. | Empty directories. |
| D11 | `queue_jobs` table | **Drop it.** | BullMQ keeps job state in Redis; the model is never referenced. |
| D12 | Content-based email dedup (`dedup_hash`) | **Drop the column; dedupe on `message_id` only.** Revisit when real forwarded mail shows whether Message-IDs differ. | The current hash includes the Message-ID, so it can never catch anything the unique `message_id` does not (EMAIL-I3). A body-only unique hash risks discarding two genuine identical bank notifications. |
| D13 | Embedding model | **`gemini-embedding-001` at 1536 dimensions**, model name in `GEMINI_EMBEDDING_MODEL`. | Matches the existing column (C4). Confirm availability first (task 3.4). |
| D14 | `user_sessions.device_id` and `LoginDto.deviceId` | **Drop from docs and schema.** | Never written; one user. |
| D15 | Document language | **English for `documents/`**; leave the Vietnamese Swagger strings and log messages as they are. | Translating runtime strings is churn with no functional gain. |
| D16 | Is the GitHub repository public? | Owner to confirm before task 0.1 pushes. | `server/docker-compose.yml` contains a development database password. It is a local default, but it should be a conscious choice. |

---

## 3. Phases

Conventions for every task:

- Run from `server/`: `npx tsc --noEmit` and `npm test` must pass before each commit (the second becomes meaningful after task 0.3).
- "Migration: yes" means `npx prisma migrate dev --create-only --name <name>`, then **read the generated SQL** before applying (risk R3).
- "Verify" steps that send requests assume the local stack from `server/docker-compose.yml` and a seeded user (task 1.2).
- One task is one commit unless stated.

### Phase 0 — Safeguard the code

**0.1 Flatten `server/` into the parent repository**
- Resolves: REPO-I1, REPO-R1. Decision D1, D16.
- Files: `server/.git` (removed), parent index.
- Change:
  1. `git -C server bundle create ../../secretary-server-history.bundle --all` (backup outside the repo).
  2. Add to `server/.gitignore`: `.agents/`, `.claude/`, `.cursor/`, `.devin/` (generated by the `prisma skills sync` postinstall script; currently tracked in the nested repo).
  3. Remove `server/.git`. From the root: `git rm --cached server`, then `git add server`.
  4. Review `git status` before committing: no `.env`, no `node_modules`, no `dist`.
  5. Commit and push.
- Migration: no. Depends on: nothing.
- Verify: `git ls-files server/src/finance | head` lists files; `git ls-files -s server | head -1` no longer shows mode `160000`; a fresh clone contains `server/src/ai-agent/`.
- Hazard: use `git rm --cached`, not `git rm`. Do step 1 first.

**0.2 Remove the document dump**
- Resolves: REPO-I2 (part of REPO-R2).
- Files: `documents/output.txt` (delete).
- Verify: `git ls-files documents/output.txt` prints nothing.

**0.3 Make `npm test` a usable gate**
- Resolves: SRV-I1 (first half of SRV-R3).
- Files: the 12 `*.spec.ts` files under `server/src`.
- Change: delete every scaffold spec that only asserts `toBeDefined()` and fails on `PrismaService` resolution. Keep the ones that pass. Real tests arrive with the tasks they cover and in Phase 5.
- Verify: `npm test` exits 0.

**0.4 Record the decisions**
- Resolves: DOC-R3; first half of DOC-R1 and DOC-R2.
- Files: `documents/decisions.md` (new).
- Change: copy the decision table from section 2 with the owner's final answers. Later documentation tasks cite it.
- Verify: file exists; every row has an answer.

### Phase 1 — Security and startup (all P0)

**1.1 Configuration validation, `.env.example`, no fallback secret**
- Resolves: SRV-R1, AUTH-R1, SRV-I2, SRV-I3, AUTH-I5.
- Files: `server/src/config/env.validation.ts` (new), `server/src/app.module.ts`, `server/src/auth/auth.module.ts`, `server/src/auth/strategies/jwt.strategy.ts`, `server/src/auth/auth.service.ts`, `server/.env.example` (new), `server/package.json`.
- Change:
  - `env.validation.ts`: a class with `class-validator` decorators and an exported `validate(config)` that runs `plainToInstance` + `validateSync` and throws on error. Required: `DATABASE_URL`, `JWT_SECRET` (`@MinLength(32)`), `JWT_REFRESH_SECRET` (`@MinLength(32)`), `REDIS_HOST`, `REDIS_PORT`. Optional with defaults: `PORT`, `NODE_ENV`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `CLIENT_URL`. Optional, feature-gated: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GEMINI_API_KEY`, `GEMINI_EMBEDDING_MODEL`, `FISH_AUDIO_API_KEY`, `FISH_AUDIO_DEFAULT_VOICE_ID`, `TOKEN_ENCRYPTION_KEY`, `BULLMQ_CONCURRENCY`, `CALENDAR_SYNC_CRON`, `APP_TIMEZONE`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
  - `ConfigModule.forRoot({ isGlobal: true, validate })`.
  - Replace the three `|| 'defaultSecretKey'` expressions with `configService.getOrThrow<string>('JWT_SECRET')`.
  - `.env.example`: every key above with a placeholder and a one-line comment. Seed-only keys `MASTER_EMAIL`, `MASTER_PASSWORD` listed too.
  - Add `dotenv` to `dependencies`.
- Migration: no. Depends on: 0.1.
- Verify: start with `JWT_SECRET` unset → process exits with a validation message naming the key. `grep -r defaultSecretKey server/src` prints nothing.
- Hazard: `JWT_REFRESH_SECRET` is new and required. Add it to the local `.env` in the same sitting or the server will not start.

**1.2 Seed script for the master user**
- Resolves: AUTH-R4, AUTH-G1.
- Files: `server/prisma/seed.ts` (new), `server/prisma.config.ts`, `server/package.json`.
- Change:
  - `seed.ts`: build a `PrismaClient` with the `PrismaPg` adapter exactly as `server/src/prisma/prisma.service.ts:12-16` does; read `MASTER_EMAIL` and `MASTER_PASSWORD`; `bcrypt.hash(password, 12)`; `prisma.user.upsert({ where: { email }, update: { passwordHash }, create: { email, passwordHash } })`. Exit non-zero if either variable is missing.
  - `prisma.config.ts`: `migrations: { path: 'prisma/migrations', seed: 'node prisma/seed.ts' }`. Node 24 runs `.ts` files by stripping types, so keep the file free of enums, decorators and parameter properties. If that does not work in practice, add `tsx` as a dev dependency and use `tsx prisma/seed.ts`.
  - `package.json`: `"seed": "prisma db seed"`.
- Migration: no. Depends on: 1.1 (`dotenv`).
- Verify: `npm run seed`, then `POST /api/v1/auth/login` with those credentials returns 200. Running the seed twice leaves one user.

**1.3 Remove the second `ScheduleModule.forRoot()`**
- Resolves: PRO-R3, PRO-I3.
- Files: `server/src/proactive/proactive.module.ts`.
- Change: delete `ScheduleModule.forRoot()` from `imports` (line 8) and its import line.
- Verify: start the server and watch one tick; `Bắt đầu Cronjob đồng bộ Google Calendar...` is logged once per five minutes, not twice.

**1.4 Separate access and refresh tokens; check the session on every request**
- Resolves: AUTH-R2, AUTH-I1, AUTH-I2, the `isActive` part of AUTH-I9.
- Files: `server/src/auth/auth.service.ts`, `server/src/auth/strategies/jwt.strategy.ts`.
- Change:
  - Access token payload: `{ sub, email, sessionId, typ: 'access' }`, signed with `JWT_SECRET` (module default).
  - Refresh token payload: `{ sub, sessionId, typ: 'refresh' }`, signed with `{ secret: JWT_REFRESH_SECRET, expiresIn: JWT_REFRESH_EXPIRES_IN }`. `refreshAccessToken` verifies with `JWT_REFRESH_SECRET` and rejects `typ !== 'refresh'`.
  - `JwtStrategy`: inject `PrismaService` (the Prisma module is global). In `validate`: reject `payload.typ !== 'access'`; `userSession.findUnique({ where: { id: payload.sessionId }, select: { userId: true, user: { select: { isActive: true } } } })`; reject if missing, if `userId !== payload.sub`, or if the user is inactive.
  - `login`: reject when `user.isActive` is false.
- Migration: no. Depends on: 1.1.
- Verify: log in, call `GET /api/v1/auth/session` with the refresh cookie's value as a bearer token → 401. Log out, reuse the old access token → 401.
- Hazard: every token issued before this commit becomes invalid. Log in again.

**1.5 Global guard with `@Public()`**
- Resolves: SRV-R2, CHAR-R1, CHAR-I1, interim half of EMAIL-R1 (EMAIL-I1).
- Files: `server/src/common/decorators/public.decorator.ts` (new), `server/src/auth/guards/jwt-auth.guard.ts`, `server/src/app.module.ts`, `server/src/auth/auth.controller.ts`, `server/src/app.controller.ts`, `server/src/character/character.controller.ts`, `server/src/email/email.controller.ts`, and the `@UseGuards(JwtAuthGuard)` lines in `finance`, `calendar`, `ai-agent`, `proactive` controllers.
- Change:
  - `export const IS_PUBLIC_KEY = 'isPublic'; export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);`
  - `JwtAuthGuard`: inject `Reflector`; in `canActivate`, return `true` when `reflector.getAllAndOverride(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])` is set, otherwise `super.canActivate(context)`.
  - `AppModule` providers: `{ provide: APP_GUARD, useClass: JwtAuthGuard }`.
  - Mark `@Public()`: `AuthController.login`, `.refreshAccessToken`, `.handleGoogleCallback`; `AppController.getHello`.
  - Do **not** mark the email webhook public. Rename the route to `POST /api/v1/email/ingest` and document it as an authenticated manual-ingest endpoint; it never was a Pub/Sub receiver (EMAIL-I1).
  - Remove the now-redundant `@UseGuards(JwtAuthGuard)` lines. Change `@ApiBearerAuth()` to `@ApiBearerAuth('JWT-auth')` on `CharacterController`.
- Migration: no. Depends on: 1.4.
- Verify: without a token, `GET /api/v1/characters` → 401 and `POST /api/v1/email/ingest` → 401; `POST /api/v1/auth/login` → 200; `GET /api/docs` still loads.
- Hazard: see risk R1. The OAuth callback and `/auth/refresh` must be public or Google linking and token refresh stop working.

**1.6 Signed `state` on the Google OAuth flow**
- Resolves: AUTH-R3, AUTH-I3.
- Files: `server/src/auth/auth.service.ts`, `server/src/auth/auth.controller.ts`.
- Change:
  - `getGoogleConnectUrl(userId)`: `state = jwtService.sign({ sub: userId, typ: 'oauth_state' }, { expiresIn: '10m' })`; pass `state` to `generateAuthUrl`. The controller passes `req.user.userId`.
  - `handleGoogleCallback(code, state)`: `jwtService.verify(state)`, require `typ === 'oauth_state'`, use `payload.sub` as the user ID. Delete the `findFirst()` fallback (lines 258-265). Missing or bad state → `BadRequestException`.
  - The controller reads `@Query('state')`.
- Migration: no. Depends on: 1.4 (the `typ` check is what stops a state token being used as an access token), 1.5.
- Verify: `GET /api/v1/auth/google/callback?code=x` with no state → 400. With a state signed for another purpose → 400.

### Phase 2 — Data correctness

**2.1 Session-bound refresh tokens: rotation, replay detection, per-session logout**
- Resolves: AUTH-R6, AUTH-R7, AUTH-I6, AUTH-I7, AUTH-I8, AUTH-G4.
- Files: `server/prisma/schema.prisma`, new migration, `server/src/auth/auth.service.ts`, `server/src/auth/auth.controller.ts`.
- Change:
  - Schema: `RefreshToken.sessionId String @map("session_id")` with a relation to `UserSession` (`onDelete: Cascade`) and `@@index([sessionId])`.
  - Migration `auth_refresh_session`: first statement `DELETE FROM "refresh_tokens";` then add the `NOT NULL` column and foreign key.
  - `login`: store `sessionId` on the token row. Set `expiresAt` from the signed token's `exp` claim (`jwtService.decode(refreshToken).exp * 1000`). Return that value so the controller uses it for the cookie `maxAge`. Remove both hard-coded 7-day values.
  - `refreshAccessToken`: find the row by hash. If it is revoked → replay: `refreshToken.updateMany({ where: { sessionId }, data: { isRevoked: true } })`, delete the session, throw 401. Otherwise, in one `$transaction`: revoke the row, create the successor with the same `sessionId`, return the new access and refresh tokens. The controller sets the new cookie.
  - `logout(userId, sessionId)`: revoke by `sessionId` and delete the session. Remove the "revoke everything for the user" branch. Accept an optional `sessionId` in the body to end another session owned by the same user.
- Migration: yes. Depends on: 1.4.
- Verify: refresh twice with the same token → second call 401, and the first call's new token is also dead. Log in twice, log out of one session, the other still refreshes.
- Hazard: all sessions are logged out by the migration. Two browser tabs refreshing at the same moment will trip replay detection; accepted for one user.

**2.2 Encrypt Google tokens; persist refreshed tokens**
- Resolves: AUTH-R5, AUTH-I4, AUTH-G2.
- Files: `server/src/common/crypto/token-cipher.ts` (new), `server/src/auth/google-client.factory.ts` (new, exported from `AuthModule`), `server/src/auth/auth.service.ts`, `server/src/auth/auth.module.ts`, `server/src/calendar/calendar-sync.service.ts`, `server/src/calendar/calendar.module.ts`.
- Change:
  - `token-cipher.ts`: `encrypt(plain)` / `decrypt(blob)` with `aes-256-gcm` from `node:crypto`, key from `TOKEN_ENCRYPTION_KEY` (32 bytes, base64), output `v1:<iv>:<tag>:<ciphertext>`.
  - `GoogleClientFactory.forUser(userId)`: loads the user, decrypts, builds `OAuth2`, calls `setCredentials({ access_token, refresh_token, expiry_date: googleTokenExpiresAt?.getTime() })`, and registers `client.on('tokens', …)` that writes the encrypted new access token and expiry (and the refresh token when one is returned). This is where `google_token_expires_at` finally gets read.
  - `handleGoogleCallback` encrypts before `user.update`.
  - `CalendarSyncService.getGoogleCalendarClient` uses the factory and drops its own `OAuth2` construction.
  - `TOKEN_ENCRYPTION_KEY` becomes required when `GOOGLE_CLIENT_ID` is set (conditional check in `env.validation.ts`).
- Migration: no (columns are already text). Depends on: 1.1, 1.6.
- Backfill: existing plaintext tokens cannot be decrypted. Run `UPDATE users SET google_access_token = NULL, google_refresh_token = NULL, google_token_expires_at = NULL;` and reconnect Google once.
- Verify: after connecting, `SELECT google_refresh_token FROM users` starts with `v1:`. Unit test: `decrypt(encrypt(x)) === x`; a tampered blob throws.

**2.3 Character: atomic activation, single-active index, nested persona routes**
- Resolves: CHAR-R2, CHAR-R3, CHAR-I2, CHAR-I3, last row of CHAR-D1.
- Files: `server/src/character/character.service.ts`, `server/src/character/character.controller.ts`, new migration.
- Change:
  - Wrap the deactivate-then-write pairs in `createCharacter`, `updateCharacter` and `setActiveCharacter` in `this.prisma.$transaction(async (tx) => …)`.
  - Migration `character_single_active` (hand-written SQL): `UPDATE characters SET is_active = false WHERE id NOT IN (SELECT id FROM characters WHERE is_active ORDER BY updated_at DESC LIMIT 1);` then `CREATE UNIQUE INDEX characters_single_active ON characters (is_active) WHERE is_active;`
  - Routes become `PATCH` / `DELETE /characters/:id/personas/:personaId`. `updatePersona(characterId, personaId, dto)` and `removePersona(characterId, personaId)` look up with `findFirst({ where: { id: personaId, characterId } })` and throw `NotFoundException` otherwise.
- Migration: yes. Depends on: 0.1.
- Verify: `PATCH /characters/<A>/personas/<persona of B>` → 404. Activating B leaves exactly one row with `is_active`.

**2.4 Atomic balance updates**
- Resolves: FIN-R1, FIN-I1, FIN-D3.
- Files: `server/src/finance/finance.service.ts`.
- Change:
  - `createTransaction`: remove the JS arithmetic (lines 153-157). Inside the `$transaction`: `tx.bankAccount.update({ where: { id }, data: { cachedBalance: dto.type === 'INCOME' ? { increment: amount } : { decrement: amount } } })` where `amount = new Prisma.Decimal(dto.amount)`.
  - `deleteTransaction`: inside one `$transaction`, delete the row and apply the opposite `increment` / `decrement` using `transaction.amount` (already a `Decimal`). Drop the separate account read and the `else` branch.
  - Remove `Number()` from balance paths.
- Migration: no. Depends on: 0.3.
- Verify: unit test with a mocked `tx` asserting the `update` is called with `{ increment }` and no absolute value. Manual: fire 20 concurrent `POST /finance/transactions` of 1.00; balance changes by exactly 20.00.

**2.5 Transaction integrity and safe account deletion**
- Resolves: FIN-R4, FIN-R5, FIN-I5, FIN-I6, FIN-I7.
- Files: `server/src/finance/finance.service.ts`, `server/prisma/schema.prisma`, new migration.
- Change:
  - `createTransaction`: reject with `BadRequestException` when the account is inactive or `category.type !== dto.type`; when `emailLogId` is given, `emailLog.findUnique` and throw `NotFoundException` if absent.
  - Schema: `Transaction.emailLogId` gets `@unique`; `Transaction.account` relation becomes `onDelete: Restrict`.
  - `deleteBankAccount`: if the account has transactions, set `isActive = false` instead of deleting; delete only when it has none.
- Migration: yes (`finance_integrity`). Depends on: 2.4.
- Backfill check before applying: `SELECT email_log_id, count(*) FROM transactions WHERE email_log_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;` must return no rows.
- Verify: EXPENSE transaction with an INCOME category → 400. Deleting an account with transactions returns it with `isActive: false`.

**2.6 Manual balance adjustment endpoint**
- Resolves: FIN-R3, FIN-I3, the balance row of FIN-G1.
- Files: `server/src/finance/dto/update-bank-account.dto.ts`, `server/src/finance/dto/adjust-balance.dto.ts` (new), `server/src/finance/finance.controller.ts`, `server/src/finance/finance.service.ts`.
- Change:
  - `UpdateBankAccountDto extends PartialType(OmitType(CreateBankAccountDto, ['cachedBalance']))`.
  - `PATCH /finance/accounts/:id/balance` with `{ newBalance: number, note?: string }`. `adjustBalance` runs in one `$transaction`: read the account, compute `delta = newBalance - cachedBalance` with `Prisma.Decimal`, return unchanged if zero, otherwise create a transaction (`type` by the sign of `delta`, `amount = |delta|`, `note` default `'Manual balance adjustment'`, `transactionTime = now`) and apply the increment or decrement.
- Migration: no. Depends on: 2.4.
- Verify: `PATCH /finance/accounts/:id` with `cachedBalance` in the body leaves the balance unchanged. The balance endpoint moves the balance and creates one transaction equal to the difference.

**2.7 Email dedup by insert-and-catch**
- Resolves: EMAIL-R2, EMAIL-I2, EMAIL-I3. Decision D12.
- Files: `server/src/email/email.service.ts`, `server/prisma/schema.prisma`, new migration.
- Change: `createEmailLog` calls `emailLog.create` directly and returns `null` when the error is `Prisma.PrismaClientKnownRequestError` with `code === 'P2002'`. Remove `findFirst`, `generateDedupHash`, and the `dedupHash` field (migration `email_drop_dedup_hash`).
- Migration: yes. Depends on: 0.3.
- Verify: unit test — `create` rejecting with `P2002` yields `null`; any other error propagates. Posting the same `messageId` twice concurrently gives two 200 responses and one row.

**2.8 Rules at ingestion, queue options, worker error handling**
- Resolves: EMAIL-R3, EMAIL-R4, EMAIL-G4, EMAIL-I6, EMAIL-I8, EMAIL-I9, the configuration half of EMAIL-G5.
- Files: `server/src/email/email-rule.service.ts`, `server/src/email/email.service.ts`, `server/src/email/email.controller.ts`, `server/src/email/email.processor.ts`.
- Change:
  - Move `isMatched` from the processor into `EmailRuleService.classify({ sender, subject, rawBody }): Promise<EmailRuleType | null>`. Precedence is by type, not creation date: any matching `blacklist` wins, then `moneylist`, then `whitelist`.
  - New `EmailService.ingest(dto)` used by the controller: create the log (2.7); classify; `blacklist` → set `SKIPPED`, do not enqueue; otherwise enqueue with `{ jobId: emailLog.id, priority: moneylist ? 1 : whitelist ? 2 : 3, attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 50 }` and put `ruleType` in the job data.
  - Processor: read `ruleType` from the job instead of re-running rules. Delete the `try/catch` DB write. Add `@OnWorkerEvent('failed')` that sets `FAILED` only when `job.attemptsMade >= (job.opts.attempts ?? 1)`, wrapped so its own failure is only logged.
  - Concurrency: in `onApplicationBootstrap`, `this.worker.concurrency = configService.get('BULLMQ_CONCURRENCY', 3)`. Do not read `process.env` in the `@Processor` decorator: decorators are evaluated at import time, before `ConfigModule` has loaded `.env` (risk R5).
- Migration: no. Depends on: 2.7, 1.5.
- Verify: unit test for `classify` with a whitelist rule older than a blacklist rule → `blacklist`. A blacklisted email produces a `SKIPPED` log and no job.

**2.9 Email rule DTO**
- Resolves: EMAIL-R5, EMAIL-I4, EMAIL-I7.
- Files: `server/src/email/dto/create-email-rule.dto.ts`, `server/src/email/email-rule.service.ts`.
- Change: add `@IsBoolean() @IsOptional() isActive?: boolean`. In `create` and `update`, when `matcher === 'regex'`: `@MaxLength(200)` on `matchValue` and a `try { new RegExp(matchValue) } catch → BadRequestException`. No `re2` (native build, and the only rule author is the authenticated owner).
- Migration: no.
- Verify: `PATCH /email-rules/:id { "isActive": false }` persists. An invalid regex → 400.

**2.10 Calendar soft delete and reminder marker (schema)**
- Resolves: schema part of CAL-R1 and PRO-R2.
- Files: `server/prisma/schema.prisma`, new migration, `server/src/calendar/calendar.service.ts`.
- Change:
  - `LocalCalendar`: add `deletedAt DateTime? @map("deleted_at")` and `remindedAt DateTime? @map("reminded_at")`. Migration `calendar_soft_delete_reminder`. A column is used instead of a new `SyncStatus` value to avoid an enum migration.
  - `deleteEvent`: if the sync state has no `googleEventId`, hard-delete as today. Otherwise set `deletedAt = now` and `syncStatus = 'DIRTY'`.
  - `getEvents` and `getEventById` add `deletedAt: null`.
  - `updateEvent`: when `startTime` is in the DTO, also set `remindedAt: null`.
- Migration: yes. Depends on: 0.1.
- Verify: deleting a synced event hides it from `GET /calendar` but the row remains with `deleted_at` set.

**2.11 Calendar push sync rewrite**
- Resolves: CAL-R1, CAL-R2, CAL-R3, CAL-R4 (as amended by C8), CAL-I1 to CAL-I5, CAL-G5, CAL-D3 (code half).
- Files: `server/src/calendar/calendar-sync.service.ts`.
- Change, per dirty row:
  - **Deleted** (`localEvent.deletedAt` set): `events.delete({ calendarId: 'primary', eventId })`; treat 404 and 410 as success; then hard-delete the local row.
  - **Insert** (no `googleEventId`): send `requestBody.id = localEvent.id.replace(/-/g, '')`. On 409 (already created by an earlier attempt) continue as an update with that ID. Store `googleEventId` and `eTag` unconditionally.
  - **Update**: `events.patch` with only the locally owned fields (`summary`, `description`, `location`, `start`, `end`). No `If-Match` (C8). On 404 or 410: clear `googleEventId`, set `SYNCED`, log that the event was removed remotely, and stop retrying.
  - **Mark synced only if unchanged**: `calendarSyncState.updateMany({ where: { id: syncState.id, updatedAt: syncState.updatedAt }, data: { syncStatus: 'SYNCED', lastSyncedAt: new Date() } })`. A local edit during the call bumps `updatedAt`, the count is 0, and the row stays `DIRTY` for the next run.
  - Add `private running = false` and return early when a run is in progress.
  - Schedule from configuration: `@Cron(process.env.CALENDAR_SYNC_CRON ?? CronExpression.EVERY_5_MINUTES)` is subject to risk R5; instead inject `SchedulerRegistry` and register a `CronJob` in `onApplicationBootstrap` from `ConfigService`.
  - Return `{ pushed, deleted, failed }` and log it.
- Migration: no. Depends on: 1.3, 2.2, 2.10.
- Verify: unit tests with a stubbed calendar client for: insert then DB failure then retry (one `insert`, one 409, no duplicate); 410 on update; edit during sync leaves `DIRTY`; soft-deleted row calls `events.delete` and removes the row.
- Unverified: Google's rules for client-supplied event IDs and the 409 response. Check the API reference before coding.

**2.12 Proactive: honest status and reminder dedup**
- Resolves: PRO-R1, PRO-R2, PRO-I1, PRO-I2.
- Files: `server/src/proactive/proactive.service.ts`.
- Change:
  - `dispatchNotification` returns `{ status: 'LOGGED' }` (it becomes `'SENT'` only in task 6.1). `evaluateAndTrigger` stops returning `success: true` unconditionally.
  - `handleFallbackCron`: query `{ startTime: { gte: now, lte: now + 15 min }, remindedAt: null, deletedAt: null }`; after dispatch, `localCalendar.update({ data: { remindedAt: new Date() } })`.
- Migration: no. Depends on: 2.10, 1.3.
- Verify: unit test — two consecutive cron runs over the same event dispatch once.

### Phase 3 — AI agent

**3.1 Chat transport: POST SSE with real streaming**
- Resolves: AI-R1, AI-I1, AI-I2, first row of AI-D1.
- Files: `server/src/ai-agent/ai-agent.controller.ts`, `server/src/ai-agent/services/agent/agent.service.ts`.
- Change:
  - `@Sse('chat/stream', { method: RequestMethod.POST })` and keep `@Body() dto` (C1).
  - Replace `chat.sendMessage` with `chat.sendMessageStream`; for each chunk, emit `{ type: 'text', content: chunk.text }` when present and collect `chunk.functionCalls`.
  - Replace the `Subject` plus detached async IIFE with `new Observable(subscriber => …)` so that a client disconnect stops the loop.
- Migration: no. Depends on: 1.5.
- Verify: `curl -N -X POST -H "Authorization: Bearer …" -H "Content-Type: application/json" -d '{"message":"xin chào"}' http://localhost:3000/api/v1/ai-agent/chat/stream` prints several `data:` frames ending with `{"type":"done"}`.
- Fallback if POST SSE misbehaves: `@Post('chat/stream')` with `@Res() res`, set `Content-Type: text/event-stream`, and write `data: …\n\n` frames by hand.

**3.2 Bounded tool loop**
- Resolves: AI-R2, AI-I3, AI-I5, AI-I6.
- Files: `server/src/ai-agent/services/agent/agent.service.ts`.
- Change: `const MAX_TOOL_ROUNDS = 5`. Each round: take all function calls of the turn; for each, look up the tool — unknown name → `{ error: 'unknown tool' }`; known → `try { result } catch (e) { { error: e.message } }`. Send **one** message containing one `functionResponse` part per call (`{ id: call.id, name: call.name, response }`). When the cap is reached, emit an `error` frame and stop.
- Migration: no. Depends on: 3.1.
- Verify: unit tests with a fake chat object: unknown tool name terminates; a throwing tool yields an error response and a final answer; two calls in one turn produce one `sendMessageStream` call with two parts; a model that always calls a tool stops after five rounds.

**3.3 Tool wrappers with DTO validation**
- Resolves: AI-R3, FIN-R2, AI-I4, FIN-I2.
- Files: `server/src/common/decorators/ai-tool.decorator.ts`, `server/src/ai-agent/services/agent/agent.service.ts`, `server/src/calendar/calendar.tools.ts` (new), `server/src/calendar/dto/ai-update-event.dto.ts` and `ai-delete-event.dto.ts` (new), `server/src/calendar/calendar.service.ts`, `server/src/calendar/calendar.module.ts`, `server/src/finance/finance.service.ts`, `server/src/finance/dto/ai-create-transaction.dto.ts` (new), `server/src/proactive/proactive.service.ts`, `server/src/ai-agent/tools/memory.tools.ts`.
- Change:
  - Contract: an `@AiTool` method takes exactly one argument object. Add `dto?: Type<object>` to `AiToolOptions`.
  - In the loop, before invoking: if `dto` is set, `const input = plainToInstance(dto, call.args)` then `await validateOrReject(input, { whitelist: true, forbidNonWhitelisted: true })`; a validation failure becomes an error function response (3.2).
  - Calendar: remove `@AiTool` from the four `CalendarService` methods. `CalendarTools` (a provider in `CalendarModule`) exposes `create_calendar_event(args)`, `get_calendar_events(args)`, `update_calendar_event({ id, ...rest })` → `updateEvent(id, rest)`, `delete_calendar_event({ id })` → `deleteEvent(id)`, each with a DTO (`CreateEventDto`, `QueryCalendarDto` and the two new ones).
  - Finance: `aiCreateTransaction` gets `dto: AiCreateTransactionDto` (same rules as `CreateTransactionDto` — `@Min(0.01)`, `@IsUUID`, `@IsEnum` — with `transactionTime` optional and `@IsDate` after `@Type(() => Date)`).
  - Proactive and memory tools: `dto: TriggerProactiveDto`, `SearchMemoryDto`, `SaveMemoryDto`.
- Migration: no. Depends on: 3.2.
- Verify: unit test — `create_financial_transaction` with `amount: -5` returns a validation error and `createTransaction` is not called; `update_calendar_event({ id, title })` calls `updateEvent(id, { title })`.

**3.4 Embeddings: working model, matching dimension, indexes**
- Resolves: AI-R4, AI-I8, AI-I9, AI-D5 (code half).
- Files: `server/src/ai-agent/genai.provider.ts` (new), `server/src/ai-agent/ai-agent.module.ts`, `server/src/ai-agent/services/memory/memory.service.ts`, `server/src/ai-agent/services/agent/agent.service.ts`, new migration.
- Change:
  - Before coding: with a real key, call `embedContent` once for `gemini-embedding-001` with `outputDimensionality: 1536` and confirm 1536 values come back. If the model is unavailable, pick the current one from Google's model list and keep 1536.
  - One `GoogleGenAI` provider built from `ConfigService.getOrThrow('GEMINI_API_KEY')`, injected into `MemoryService` and `AgentService` (both currently construct their own with `process.env.GEMINI_API_KEY || ''`).
  - `generateEmbedding(text, taskType)`: `model: config.get('GEMINI_EMBEDDING_MODEL', 'gemini-embedding-001')`, `config: { outputDimensionality: 1536, taskType }` (`RETRIEVAL_DOCUMENT` on save, `RETRIEVAL_QUERY` on search). Throw if `values.length !== 1536`.
  - Migration `ai_memory_indexes` (hand-written SQL): `CREATE INDEX ai_memories_embedding_hnsw ON ai_memories USING hnsw (embedding vector_cosine_ops);` and `CREATE INDEX ai_memories_content_tsv_gin ON ai_memories USING gin (content_tsv);`
  - `saveMemory`: wrap the `create` and the raw `UPDATE` in one `$transaction` so a failed embedding write does not leave a row with no vector.
- Migration: yes (indexes only; the column stays `vector(1536)`). Depends on: 1.1.
- Backfill check: `SELECT count(*) FROM ai_memories WHERE embedding IS NOT NULL;`. Expected 0, since saves cannot have succeeded. If not 0, re-embed those rows with the new model before trusting search results.
- Verify: `POST /ai-agent/memories` returns 201 and the row has a non-null `embedding`; `\d ai_memories` shows both indexes.

**3.5 Search quality**
- Resolves: AI-R5, AI-I10, AI-I11, AI-I12, AI-G3.
- Files: `server/src/ai-agent/dto/search-memory.dto.ts`, `server/src/ai-agent/queries/memory.queries.ts`, `server/src/ai-agent/services/memory/memory.service.ts`.
- Change:
  - DTO: `limit` gets `@IsInt() @Min(1) @Max(20)`; add `minScore?: number` (`@Min(0) @Max(1)`, default 0.5 — tune against real data) and `source?: string`.
  - Query: use `ts_rank(content_tsv, plainto_tsquery('simple', $q), 32)` (normalisation flag 32 maps rank into 0..1) so the 0.3 weight is on the same scale as cosine similarity; add `WHERE vector_similarity >= ${minScore}` in the outer select and the optional `source` filter.
  - `searchMemory` updates `lastAccessedAt` only for rows that were returned, which are now only rows above the cut-off.
- Migration: no. Depends on: 3.4.
- Verify: with three stored memories, a query unrelated to all of them returns `[]` and no `last_accessed_at` changes.

**3.6 Confirmation for write tools**
- Resolves: first half of AI-R6, AI-I7 (the email half is in 6.3; see C10).
- Files: `server/src/common/decorators/ai-tool.decorator.ts`, `server/src/ai-agent/services/agent/agent.service.ts`, `server/src/ai-agent/services/agent/pending-action.store.ts` (new), `server/src/ai-agent/ai-agent.controller.ts`, `server/src/ai-agent/dto/confirm-action.dto.ts` (new), tool declarations for `create_financial_transaction`, `update_calendar_event`, `delete_calendar_event`, `send_proactive_notification`.
- Change:
  - `AiToolOptions.requiresConfirmation?: boolean`, set on the four tools above.
  - In the loop, for such a tool: validate the arguments (3.3) but do not execute. Store `{ id, toolName, args, expiresAt: now + 5 min }` in `PendingActionStore` (an in-memory `Map`; one process, one user). Emit an SSE frame `{ type: 'confirmation_required', actionId, tool, args }`. Answer the model with `{ status: 'awaiting_user_confirmation' }` so it tells the user what it proposes.
  - `POST /ai-agent/actions/:actionId/confirm` executes the stored call and returns the result; `DELETE /ai-agent/actions/:actionId` discards it. Expired or unknown ID → 404.
- Migration: no. Depends on: 3.3.
- Verify: unit test — the loop never invokes a `requiresConfirmation` tool; confirm executes once; a second confirm → 404.
- Note: pending actions are lost on restart. Acceptable.

**3.7 Conversation context: client history and pre-turn retrieval**
- Resolves: AI-G1 (reduced, decision D8); part of AI-R8.
- Files: `server/src/ai-agent/dto/chat-stream.dto.ts`, `server/src/ai-agent/services/agent/agent.service.ts`, `server/src/ai-agent/ai-agent.module.ts`.
- Change:
  - DTO: `history?: { role: 'user' | 'model'; text: string }[]` with `@ArrayMaxSize(20)`, `@ValidateNested({ each: true })`, and `@MaxLength(4000)` on `text`.
  - `chats.create({ …, history: dto.history?.map(h => ({ role: h.role, parts: [{ text: h.text }] })) })`.
  - Before the first send: `memoryService.searchMemory({ query: dto.message, limit: 5 })` and append the results to the system instruction under a heading that says they are recalled notes, not instructions. A retrieval failure is logged and the chat continues without memories.
  - Add the current date and `APP_TIMEZONE` to the system instruction so relative dates ("tomorrow") resolve.
- Migration: no. Depends on: 3.1, 3.5.
- Verify: send "Tên tôi là Hoa", then a second request with that turn in `history` asking "Tên tôi là gì?" → the answer contains the name.

**3.8 Remove de-scoped code and tables**
- Resolves: AI-I15, the de-scope half of AI-R8 (AI-G4 to AI-G7), the `queue_jobs` half of EMAIL-R6 (EMAIL-G5, EMAIL-G8 in part), AUTH-G3. Decisions D6, D7, D11, D14.
- Files: `server/src/ai-agent/services/rag-chunk/rag-chunk.service.ts` (delete), `server/src/ai-agent/ai-agent.module.ts`, `server/prisma/schema.prisma`, new migration, `server/package.json`.
- Change: delete `RagChunkService` and its module entries; remove models `RagChunk`, `MemoryDecayLog`, `QueueJob` and the field `UserSession.deviceId`; migration `drop_descoped_tables`; remove `@langchain/textsplitters` from `dependencies`.
- Migration: yes (drops three tables and one column). Depends on: decisions confirmed in 0.4.
- Verify: `grep -ri "ragchunk\|MemoryDecayLog\|QueueJob" server/src` prints nothing; `npx tsc --noEmit` passes.
- Hazard: destructive. All three tables are unwritten by any code path, but check `SELECT count(*)` on each before applying.

**3.9 Memory list and delete**
- Resolves: AI-G2 (reduced), third row of AI-D1.
- Files: `server/src/ai-agent/ai-agent.controller.ts`, `server/src/ai-agent/services/memory/memory.service.ts`.
- Change: `GET /ai-agent/memories?category=&source=&page=&pageSize=` (plain `findMany`, newest first, `pageSize` max 50) and `DELETE /ai-agent/memories/:id`. Update is not built: delete and re-create.
- Migration: no.
- Verify: a saved memory appears in the list and is gone after delete.

### Phase 4 — Documentation refactor

Rule from this phase on: a commit that changes a route, an environment variable, a table or a tool also changes the matching document.

**Target structure**

```
documents/
├── README.md              index + the status legend
├── summary.md             product description, with a status column per capability
├── decisions.md           build / de-scope decisions (task 0.4)
├── setup.md               docker compose, migrate, seed, start, connect Google
├── environment.md         every variable: required?, default, used by
├── conventions.md         response envelope, errors, auth model, timezone, language
├── database.md            tables as they are in schema.prisma (replaces db.md)
├── api.md                 route table per module, generated from the code; Swagger is the reference
├── modules/
│   ├── auth.md
│   ├── character.md
│   ├── email.md           ingestion, rules, worker
│   ├── finance.md
│   ├── calendar.md        includes the sync job
│   ├── ai-agent.md        chat, tools, memory, TTS
│   └── proactive.md
├── flows/
│   ├── email.mmd  finance.mmd  calendar.mmd  ai-agent.mmd
└── templates/
    └── module.md
```

**Status marking.** Every section heading in `summary.md` and `modules/*.md` carries one tag:

- `[Implemented]` — in the code and exercised by a test or a documented manual check.
- `[Partial]` — in the code with a stated limitation; the limitation is the first line of the section.
- `[Planned]` — not in the code. The section states intent only and links to the row in `decisions.md`.

Each module document starts with a status table (capability, status, code location). A `[Planned]` section contains no request or response examples, so it cannot be mistaken for a contract.

**4.1 Skeleton and conventions**
- Resolves: DOC-R1, DOC-1, DOC-8, DOC-7, the envelope and timezone parts of DOC-6.
- Files: `documents/README.md`, `documents/conventions.md`, `documents/templates/module.md` (all new); delete `documents/templates/controller.md` and `documents/templates/service.md`.
- Change: write the legend above; state that Swagger at `/api/docs` is the API reference and the `.md` files describe design and status; state the language rule (D15), the `{ statusCode, message, data }` envelope, and the timezone policy (`APP_TIMEZONE`, stored times are UTC).
- Verify: the three files exist; the old templates are gone.

**4.2 Rewrite `summary.md`**
- Resolves: REPO-R3, REPO-G1, DOC-4, AI-D6, the `summary.md` part of DOC-R4.
- Files: `documents/summary.md`.
- Change: correct the stack line (Prisma only; Gemini via `@google/genai`; no OpenAI or Anthropic). Add a status tag to every capability according to `decisions.md`: clients `[Planned]`; Pub/Sub `[Planned]`, Gmail polling `[Planned]` until Phase 6; AI classification `[Planned]`; Telegram `[Planned]`; ledger `[Implemented]`; calendar "one-way push" `[Implemented]`; memory `[Partial]`; decay "applied at query time" `[Implemented]`; proactive triggers: reminders `[Implemented]`, the rest `[Planned]`. Replace "zero duplicate" with the actual mechanism (unique `message_id`, unique `transactions.email_log_id`).
- Verify: `grep -n "TypeORM\|OpenAI\|Anthropic" documents/summary.md` prints nothing.

**4.3 Replace `endpoint.md` with `api.md`**
- Resolves: DOC-R2, DOC-2, DOC-3 (part), CHAR-D1, EMAIL-D1, FIN-D1, CAL-D1, AI-D1, PRO-D1.
- Files: `documents/endpoint.md` (delete), `documents/api.md` (new).
- Change: one table per module with method, path, auth (`JWT` / `Public`), and a one-line purpose, taken from the controllers after Phases 1–3. Planned endpoints go in a separate "Planned" table per module with no path guarantees. Drop the fictional `docs/...` file tree.
- Depends on: 1.5, 2.3, 2.6, 3.1, 3.9.
- Verify: every `@Get/@Post/@Patch/@Delete` in `server/src/**/*.controller.ts` has a row, and every row in the implemented tables resolves in Swagger.

**4.4 Replace `db.md` with `database.md`**
- Resolves: DOC-5, CAL-D2, EMAIL-D4, EMAIL-G8 (doc half), FIN-G5 (doc half), AI-D5, the `db.md` part of DOC-R4.
- Files: `documents/db.md` (delete), `documents/database.md` (new).
- Change: one section per model in `server/prisma/schema.prisma` after Phase 3: columns, constraints, and the hand-written indexes (single-active character, HNSW, GIN) that the schema file cannot show. Remove `queue_jobs`, `rag_chunks`, `memory_decay_logs`, `dedup_hash`, `device_id`. Say "tokens encrypted with AES-256-GCM" only for the Google tokens; refresh tokens are stored as SHA-256 hashes, not "encrypted". Embedding is 1536, full stop.
- Depends on: 3.8.
- Verify: table names in the document equal the `@@map` names in the schema.

**4.5 Merge and rewrite the module documents**
- Resolves: AUTH-R9, AUTH-D1 to AUTH-D3, CHAR-R4, CHAR-D2, CHAR-D3, EMAIL-R8, EMAIL-D2, EMAIL-D3, FIN-R8, FIN-D2, FIN-D3, CAL-R7, CAL-D3, AI-R9 (text parts), AI-D2 to AI-D4, AI-D9, AI-G8, PRO-R6, PRO-D2.
- Files: delete the fourteen `documents/modules/*/*.controller.md`, `*.service.md` and `email.worker.md`; create the seven `documents/modules/<name>.md` files.
- Change, using `templates/module.md` (status table, responsibilities, data, behaviour, AI tools, limitations, planned):
  - `auth.md`: `email` + `password` login, the real response, token types and secrets, session check, rotation and replay, state parameter, seed bootstrap, the three OAuth scopes.
  - `character.md`: one service, the nested persona routes, optional `voiceId` / `source`.
  - `email.md`: the authenticated ingest endpoint; rule precedence; BullMQ with `WorkerHost` and `@OnWorkerEvent` (not `@nestjs/bull` decorators); queue name `email-processing`; class `EmailProcessor`; statuses including `FAILED`. Gmail fetch and AI classification under `[Planned]`.
  - `finance.md`: `cachedBalance` and `emailLogId` as the field names; increment/decrement inside a transaction; the adjustment endpoint; `transactions/search` as it is; summary, pagination, update endpoints `[Planned]`.
  - `calendar.md`: one-way push, the sync algorithm from 2.11, soft delete, `fromDate` / `toDate`; pull sync and conflicts `[Planned]`.
  - `ai-agent.md`: the ten tools by their real names with a confirmation column; `'simple'` text search and why; decay default 0.01 at query time; client-held history; TTS as buffered MP3 `[Partial]`.
  - `proactive.md`: route, enums, reminder cron, status values.
- Depends on: Phases 1–3.
- Verify: `grep -rn "AiService\|AiToolRegistryService\|src/shared\|@Process()\|OnQueue" documents/modules` prints nothing.

**4.6 Flow diagrams**
- Resolves: EMAIL-D5, AI-D8, the diagram part of DOC-R4.
- Files: move and rename the four `documents/modules/*/*-flow.mermaid.live` files to `documents/flows/*.mmd`.
- Change: redraw from the code after Phases 1–3. Email: authenticated ingest → rules → queue → worker; no Pub/Sub actor. AI: `POST /ai-agent/chat/stream`, pre-turn retrieval, tool loop with confirmation; no `RagChunkService`. Remove the `[cite: N]` markers. Draw planned steps dashed and labelled `Planned`.
- Verify: each file renders in a Mermaid viewer; `grep -rn "cite:" documents/flows` prints nothing.

**4.7 Regenerate the decorator document**
- Resolves: AI-D7, the decorator part of AI-R9.
- Files: `documents/configs/AiTool-Decorator.md` → rewrite in place as one English document.
- Change: describe the real `AiToolOptions` from `server/src/common/decorators/ai-tool.decorator.ts`, including `dto` and `requiresConfirmation`, the one-argument contract, and discovery in `AgentService`.
- Depends on: 3.3, 3.6.

**4.8 Setup, environment, README; remove `log.md`**
- Resolves: DOC-R5, DOC-6, REPO-G2, REPO-I3 (rest of REPO-R2), AUTH-D3, DOC-3 (rest).
- Files: `documents/setup.md`, `documents/environment.md` (new); `server/README.md` (rewrite); `documents/modules/log.md` (delete).
- Change: `setup.md` — `docker compose up -d`, `npm install`, copy `.env.example`, `npx prisma migrate deploy`, `npm run seed`, `npm run start:dev`, how to connect Google. `environment.md` — the table from `env.validation.ts`. `server/README.md` — ten lines pointing to `documents/setup.md`. `log.md` is a generation log with stale routes; anything still useful moves to `decisions.md`.
- Depends on: 1.1, 1.2.
- Verify: a fresh clone can be brought to a successful login by following `setup.md` only.

### Phase 5 — Tests and hardening (P2)

**5.1 Unit tests for the risky paths**
- Resolves: SRV-R3 (second half).
- Files: `server/src/finance/finance.service.spec.ts`, `server/src/email/email.service.spec.ts`, `server/src/email/email-rule.service.spec.ts`, `server/src/ai-agent/services/agent/agent.service.spec.ts`, `server/src/calendar/calendar-sync.service.spec.ts`, `server/src/auth/strategies/jwt.strategy.spec.ts` (new or recreated).
- Change: collect the tests named in tasks 1.4, 2.4, 2.7, 2.8, 2.11, 3.2, 3.3, 3.6 if they were not written with those tasks. Provide `PrismaService` as a hand-written mock object; no database.
- Verify: `npm test` passes; `npm run test:cov` shows the four services covered.

**5.2 Global prefix, response envelope, error filter, `helmet`**
- Resolves: SRV-R4 (SRV-I4, SRV-I5).
- Files: `server/src/main.ts`, `server/src/common/interceptors/response.interceptor.ts` (new), `server/src/common/filters/prisma-exception.filter.ts` (new), all seven controllers, `server/package.json`.
- Change: `app.setGlobalPrefix('api/v1', { exclude: ['/'] })` and strip `api/v1` from every `@Controller(...)`; an interceptor that wraps return values in `{ statusCode, message, data }` so handlers return data only; a filter mapping Prisma `P2002` → 409, `P2025` → 404, `P2003` → 400; `app.use(helmet())`.
- Depends on: 4.3 (so the route table is checked once more after this).
- Verify: the route list in Swagger is identical before and after; a duplicate insert returns 409, not 500.
- Hazard: the prefix change must touch all controllers in one commit. The refresh cookie `path` (`/api/v1/auth`) must still match.

**5.3 Indexes**
- Resolves: SRV-R5, SRV-I6.
- Files: `server/prisma/schema.prisma`, new migration.
- Change: `@@index` on `Transaction(accountId, transactionTime)`, `Transaction(categoryId)`, `LocalCalendar(startTime)`, `EmailLog(status)`, `CalendarSyncState(syncStatus)`, `UserSession(userId)`, `RefreshToken(userId)`.
- Migration: yes. Verify: the generated SQL contains only `CREATE INDEX` (risk R3).

**5.4 Auth polish**
- Resolves: AUTH-R8 (AUTH-I9 remainder, AUTH-I10).
- Files: `server/src/auth/auth.controller.ts`, `server/src/main.ts`, `server/src/app.module.ts`, `server/package.json`.
- Change: add `@nestjs/throttler` and limit `POST /auth/login` to 5 per minute; use `req.ip` and set `app.set('trust proxy', …)` only when deployed behind a proxy; fix the `/refresh` Swagger summary and remove its `@ApiBearerAuth`.
- Verify: the sixth login within a minute → 429.

**5.5 Finance polish**
- Resolves: FIN-R6, FIN-I4; from FIN-R7: the category `type` filter and pagination (FIN-G2), active-only accounts (FIN-G4).
- Files: `server/src/finance/finance.service.ts`, `server/src/finance/finance.controller.ts`, `server/src/finance/dto/filter-transaction.dto.ts`.
- Change: `getTotalBalance` uses `bankAccount.groupBy({ by: ['currency'], _sum: { cachedBalance: true }, where: { isActive: true } })` and returns one total per currency; `GET /finance/categories?type=`; `page` / `pageSize` on the transaction search with a `{ items, total }` result; `GET /finance/accounts?includeInactive=`.
- Verify: two accounts in different currencies give two totals.

**5.6 Calendar polish**
- Resolves: CAL-R5, CAL-I6; from CAL-R6: `POST /calendar/sync` (CAL-G2) and sync counts (CAL-G6).
- Files: `server/src/calendar/dto/create-event.dto.ts`, `server/src/calendar/calendar.service.ts`, `server/src/calendar/calendar.controller.ts`.
- Change: reject `endTime <= startTime` in `createEvent` and `updateEvent`; define `fromDate` / `toDate` as "events overlapping the range" (`startTime <= toDate AND endTime >= fromDate`) and document it; `POST /calendar/sync` returns the counts from 2.11.
- Verify: an event from 09:00 to 11:00 is returned for a 10:00–12:00 query.

**5.7 TTS**
- Resolves: AI-R7, AI-I13, AI-I14.
- Files: `server/src/ai-agent/services/tts/tts.service.ts`, `server/src/ai-agent/ai-agent.controller.ts`.
- Change: throw `ServiceUnavailableException` when the key is missing and `BadRequestException` when no voice resolves; the outer `catch` rethrows `HttpException`s and otherwise returns a fixed message; pipe the upstream body to the response (`Readable.fromWeb(response.body).pipe(res)`) instead of buffering.
- Verify: with no key, `POST /ai-agent/tts` → 503 with the fixed message.

**5.8 Timezone**
- Resolves: PRO-R4, PRO-I4.
- Files: `server/src/proactive/proactive.service.ts`.
- Change: format reminder times with `toLocaleTimeString('vi-VN', { timeZone: config.get('APP_TIMEZONE', 'Asia/Ho_Chi_Minh') })`. An environment variable, not a per-user setting: there is one user.
- Verify: unit test with a fixed date and two zone values.

### Phase 6 — Core features (after the owner confirms D3 and D4)

Tasks are described at design level; split them further when starting.

**6.1 Telegram delivery**
- Resolves: the Telegram half of PRO-R5 (PRO-G3), EMAIL-G6 (channel).
- Files: `server/src/proactive/telegram.client.ts` (new), `server/src/proactive/proactive.service.ts`, `server/src/proactive/proactive.module.ts`.
- Change: `sendMessage(text)` doing `fetch('https://api.telegram.org/bot<token>/sendMessage', { chat_id, text })`. `dispatchNotification` returns `SENT` on HTTP 200, `FAILED` on error, `NOT_CONFIGURED` when the token or chat ID is absent. Remove `PUSH_NOTIFICATION` and `ALL` from the channel enum and from the tool declaration.
- Verify: with a real bot token, `POST /proactive/trigger` delivers a message.

**6.2 Gmail polling ingestion**
- Resolves: the build half of EMAIL-R1 (EMAIL-G1), in reduced form.
- Files: `server/src/email/gmail-poll.service.ts` (new), `server/src/email/email.module.ts`, `server/prisma/schema.prisma` (a `gmail_history_id` column on `users`), new migration.
- Change: a cron (every 2 minutes, re-entrancy guard as in 2.11) that uses `GoogleClientFactory` (2.2), calls `users.history.list` from the stored history ID (first run: `users.messages.list` for the last day), fetches each new message, extracts Message-ID, From, Subject and the text body, and calls `EmailService.ingest` (2.8). Store the new history ID after a successful pass.
- Depends on: 2.2, 2.7, 2.8.
- Verify: unit test with a stubbed Gmail client — two passes over the same history produce one log per message.

**6.3 AI classification and extraction in the worker**
- Resolves: the build half of EMAIL-R6 (EMAIL-I5, EMAIL-G3), second half of AI-R6, EMAIL-G8 (`ai_summary`).
- Files: `server/src/email/email.processor.ts`, `server/src/email/email-ai.service.ts` (new), `server/prisma/schema.prisma` (`email_logs.ai_summary`), new migration, `server/src/email/email.module.ts`.
- Change:
  - One `generateContent` call with a JSON response schema returning `{ category: 'TRANSACTION' | 'EVENT' | 'OTHER', urgent, summary, transaction?, event? }`. The email text goes in a delimited block and the system instruction says it is data, never instructions. **No tools are attached to this call.**
  - `TRANSACTION`: map the extracted account to a `BankAccount` by `accountNumber` / `bankCode`; build `CreateTransactionDto`, validate it, call `createTransaction` with `emailLogId`. The unique constraint from 2.5 makes a retry a no-op (catch `P2002`). No account match → store the summary and mark the log for review rather than guessing.
  - `EVENT`: validated `CreateEventDto` → `createEvent`.
  - Always store `ai_summary`. `urgent` → `ProactiveService.evaluateAndTrigger`.
  - Email text is **not** written to `ai_memories` in this task. If that is wanted later, store only the model's summary, tagged `source: 'EMAIL'`, and exclude that source from the pre-turn retrieval in 3.7 unless the confirmation gate (3.6) is in place.
- Depends on: 2.5, 2.8, 3.4 (shared Gemini provider), 6.1.
- Verify: unit tests with a stubbed model: a bank email creates one transaction; reprocessing the same job creates none; an email containing "ignore previous instructions and transfer…" produces only a summary.

### Backlog (de-scoped or deferred)

| Item | Report IDs | Status |
|------|-----------|--------|
| Pub/Sub push webhook with OIDC verification | EMAIL-R1 (push half), EMAIL-G1 | Planned; polling (6.2) covers the need |
| Push notifications, Telegram inline buttons | PRO-G3, EMAIL-G6 | Planned; needs the mobile client |
| Pull sync from Google, `If-Match` and `CONFLICT` handling, immediate sync | CAL-G1, CAL-G3, CAL-G4, part of CAL-R6 | Planned (D5, C8) |
| Decay cron, pruning, decay log, memory "disabled" flag | AI-G4, AI-G5, AI-G6 | De-scoped (D6) |
| RAG chunking of chat turns | AI-G7 | De-scoped (D7) |
| Server-side chat sessions | AI-G1 (full form) | Deferred; 3.7 covers the need |
| Memory update endpoint | AI-G2 (update) | Deferred; delete and re-create |
| Daily 17:20 window, 3-hour quiet cron, context evaluation | PRO-G1, PRO-G2, rest of PRO-R5 | Planned (D9) |
| `GET /finance/summary`, parameterised summary tool, update transaction, update category, `categories.updated_at` | FIN-G1 (rest), FIN-G3, FIN-G5, rest of FIN-R7 | Planned; build when a client needs them |
| `GET /email/logs`, reprocess endpoint, rule `type` filter | EMAIL-R7, EMAIL-G2, EMAIL-G7 | Planned; small, do alongside 6.2 if wanted |
| Web and mobile clients | REPO-G1 | Planned (D10) |

---

## 4. Risks and ordering hazards

- **R1 — Global guard lock-out (task 1.5).** With `APP_GUARD`, anything not marked `@Public()` needs a bearer token. The Google callback arrives as a browser redirect with no token, and `/auth/refresh` is called precisely when the access token has expired. Both must be public. The Swagger UI is served by Express middleware and is unaffected. After Phase 6 there is no inbound webhook at all; if Pub/Sub push is ever built, that route needs `@Public()` plus its own verification.
- **R2 — Token invalidation.** Tasks 1.4 and 2.1 each invalidate every existing login; 2.2 requires reconnecting Google. Do them when that is convenient, and do 1.2 (seed) first so a login is always possible.
- **R3 — Prisma and hand-written indexes.** The partial unique index (2.3) and the HNSW and GIN indexes (3.4) cannot be expressed in `schema.prisma`. A later `prisma migrate dev` may generate `DROP INDEX` for them. Always use `--create-only`, read the SQL, and delete any such statement. Task 5.3 is the first place this can bite.
- **R4 — Vector dimension.** The plan deliberately does not change `vector(1536)`. If a different dimension is ever chosen, the column must be dropped and re-created, every memory re-embedded, and the HNSW index rebuilt; above 2000 dimensions HNSW on `vector` is not available. Vectors from different models are not comparable, so a model change means re-embedding even at the same dimension.
- **R5 — Environment variables in decorators.** `@Cron(process.env.X)` and `@Processor(name, { concurrency: process.env.X })` are evaluated when the file is imported, before `ConfigModule.forRoot()` has loaded `.env`. They silently fall back to the default. Tasks 2.8 and 2.11 set these values at bootstrap instead.
- **R6 — Destructive migrations.** 2.1 deletes refresh tokens; 2.7 drops `dedup_hash`; 3.8 drops three tables and a column. Take a `pg_dump` before each.
- **R7 — Migrations that can fail on existing data.** 2.3 (more than one active character — the migration fixes it first) and 2.5 (duplicate `email_log_id` — check query given). 2.5 also changes account deletion from cascade to restrict; the service change in the same task must ship with it.
- **R8 — Order inside Phase 2 and 3.** 1.3 before 2.11 (otherwise two sync runs race). 2.10 before 2.11 and 2.12. 2.7 before 2.8. 2.4 before 2.5 and 2.6. 3.2 before 3.3 before 3.6. 3.4 before 3.5 before 3.7. 3.8 only after the owner confirms D6, D7, D11, D14.
- **R9 — Flattening the repository (0.1).** `git rm` without `--cached` on the gitlink, or deleting `server/.git` before the bundle exists, loses the only history of `server/`. Both `.gitignore` files exclude `.env`; confirm with `git status` before the first commit.
- **R10 — Confirmation gate and Phase 6.** Task 6.3 must not attach tools to the classification call, and must not feed raw email text into chat context. Until 3.6 exists, nothing derived from email should reach a model that has write tools.

---

## 5. Traceability

Every recommendation ID in `report.md`, mapped to a task.

| ID | Priority | Task | Note |
|----|----------|------|------|
| REPO-R1 | P0 | 0.1 | |
| REPO-R2 | P2 | 0.2, 4.8 | |
| REPO-R3 | P2 | 4.2 | |
| AUTH-R1 | P0 | 1.1 | Same change as SRV-R1 |
| AUTH-R2 | P0 | 1.4 | |
| AUTH-R3 | P0 | 1.6 | |
| AUTH-R4 | P0 | 1.2 | |
| AUTH-R5 | P1 | 2.2 | |
| AUTH-R6 | P1 | 2.1 | Needs a migration (C7) |
| AUTH-R7 | P1 | 2.1 | Needs a migration (C7) |
| AUTH-R8 | P2 | 5.4, 3.8 | `deviceId` dropped in 3.8 (D14) |
| AUTH-R9 | P2 | 4.5 | |
| CHAR-R1 | P0 | 1.5 | Same change as SRV-R2 |
| CHAR-R2 | P1 | 2.3 | Extended to create and update (C6) |
| CHAR-R3 | P1 | 2.3 | |
| CHAR-R4 | P2 | 4.3, 4.5 | Docs follow code (D2) |
| EMAIL-R1 | P1 | 1.5 (interim), 6.2 (reduced) | Pub/Sub push deferred to backlog (D3) |
| EMAIL-R2 | P1 | 2.7 | Content hash dropped, not rebuilt (D12) |
| EMAIL-R3 | P1 | 2.8 | |
| EMAIL-R4 | P1 | 2.8 | |
| EMAIL-R5 | P1 | 2.9 | Without `re2` |
| EMAIL-R6 | P1 | 0.4 (decision), 3.8 (`queue_jobs`), 6.1, 6.3 | |
| EMAIL-R7 | P2 | Deferred | Backlog; no client needs it yet |
| EMAIL-R8 | P2 | 4.4, 4.5, 4.6 | |
| FIN-R1 | P1 | 2.4 | |
| FIN-R2 | P1 | 3.3 | Same change as AI-R3 |
| FIN-R3 | P1 | 2.6 | |
| FIN-R4 | P1 | 2.5 | |
| FIN-R5 | P1 | 2.5 | |
| FIN-R6 | P2 | 5.5 | |
| FIN-R7 | P2 | 5.5 (filter, pagination, active-only); rest deferred | Backlog |
| FIN-R8 | P2 | 4.3, 4.5 | |
| CAL-R1 | P1 | 2.10, 2.11 | |
| CAL-R2 | P1 | 2.11 | |
| CAL-R3 | P1 | 2.11 | |
| CAL-R4 | P1 | 2.11 | `patch` and 404/410 done; `If-Match` / `CONFLICT` deferred (C8) |
| CAL-R5 | P2 | 5.6 | |
| CAL-R6 | P2 | 0.4 (decision), 2.11 (cron config), 5.6 (manual sync, counts) | Pull and immediate sync de-scoped (D5) |
| CAL-R7 | P2 | 4.3, 4.5 | |
| AI-R1 | P1 | 3.1 | Uses the `@Sse` method option (C1) |
| AI-R2 | P1 | 3.2 | |
| AI-R3 | P1 | 3.3 | |
| AI-R4 | P1 | 3.4 | No column change (C4) |
| AI-R5 | P1 | 3.5 | |
| AI-R6 | P1 | 3.6, 6.3 | Email half moves to 6.3 (C10) |
| AI-R7 | P2 | 5.7 | |
| AI-R8 | P2 | 0.4 (decision), 3.7, 3.8, 3.9 | Decay job, RAG, sessions de-scoped (D6–D8) |
| AI-R9 | P2 | 4.5, 4.6, 4.7 | |
| PRO-R1 | P1 | 2.12 | |
| PRO-R2 | P1 | 2.10, 2.12 | |
| PRO-R3 | P0 | 1.3 | Confirmed from source (C2) |
| PRO-R4 | P2 | 5.8 | Environment variable, not a user setting |
| PRO-R5 | P2 | 0.4 (decision), 6.1 | Other triggers de-scoped (D9) |
| PRO-R6 | P2 | 4.5 | |
| SRV-R1 | P0 | 1.1 | `class-validator`, not Joi/zod (C5) |
| SRV-R2 | P0 | 1.5 | |
| SRV-R3 | P2 | 0.3, 5.1 | Clean-up moved to Phase 0 |
| SRV-R4 | P2 | 1.1 (`dotenv`), 5.2 | `dotenv` moved to Phase 1 |
| SRV-R5 | P2 | 5.3 | |
| DOC-R1 | P1 | 0.4, 4.1 | |
| DOC-R2 | P1 | 0.4, 4.3 | Docs follow code (D2) |
| DOC-R3 | P1 | 0.4 | |
| DOC-R4 | P2 | 4.2, 4.3, 4.4, 4.6 | |
| DOC-R5 | P2 | 4.1, 4.8 | |

Items in the report that had no recommendation and are covered here: EMAIL-I9 → 2.8; AI-G8 → 4.5; REPO-G2 → 4.8; FIN-D3 → 2.4 and 4.5.
