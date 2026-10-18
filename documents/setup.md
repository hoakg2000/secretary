# Secretary — Local setup

Server commands run from `server/`; the web client has its own section below. Needs Node 24 or newer (`engines` in `package.json`: `>=24`) and Docker. The reason for a recent Node: `npm run seed` runs `prisma/seed.ts` directly through Node's type stripping (`node prisma/seed.ts`, set in `prisma.config.ts`), so Node must support that without a flag.

## First run

1. Start Postgres (pgvector) and Redis:
   ```
   docker compose up -d
   ```
   `docker-compose.yml` uses a development-only database password.
2. Install dependencies:
   ```
   npm install
   ```
3. Create the environment file and fill it in (see `environment.md`):
   ```
   cp .env.example .env
   ```
   `JWT_SECRET` and `JWT_REFRESH_SECRET` must each be at least 32 characters. Set `MASTER_EMAIL` and
   `MASTER_PASSWORD` for step 5. Set `MOT_API_KEY` for chat and email classification (and `GEMINI_API_KEY` for memories). The server refuses to start and names the key when a required value is missing.
4. Apply the migrations:
   ```
   npx prisma migrate deploy
   ```
5. Load the characters from `documents/characters/*.json`, then create the master user (safe to repeat; it updates the password):
   ```
   npm run seed
   ```
6. Start the server:
   ```
   npm run start:dev
   ```
   API under `http://localhost:3000/api/v1`, Swagger at `http://localhost:3000/api/docs`.
7. Log in: `POST /api/v1/auth/login` with the seeded email and password.

## Run the web client

The server listens on port 3000 and the web client on 3001. `CLIENT_URL` in `server/.env` must be the client's origin
(`http://localhost:3001`, the default), because the server uses it for CORS and for the Google callback redirect.

1. Start the server (step 6 above).
2. In a second terminal:
   ```
   cd web-client
   npm install
   cp .env.example .env.local
   npm run dev
   ```
   `NEXT_PUBLIC_API_URL` in `.env.example` is `http://localhost:3000/api/v1` (see `environment.md`).
3. Open `http://localhost:3001` and log in with the seeded user.

## Switch the LLM provider

Chat and email classification go through `LlmService`. Edit `LLM_TYPE` in `server/src/llm/llm.service.ts` (`'motapi'`
or `'gemini'`); the model of each provider is in `LLM_MODELS` in the same file. `motapi` needs `MOT_API_KEY`, `gemini`
needs `GEMINI_API_KEY`. Embeddings always use Gemini. It is a code change, so restart the server.

## Add a character

Drop a JSON file in `documents/characters/` (format: `modules/character/character.service.md`, section "Character JSON") and run `npm run seed` again. The seed upserts by `slug`. The JSON is the source of truth: re-seeding overwrites changes made through the API to a seeded character. All files are validated before anything is written (types, duplicate slugs), so one broken file writes nothing; the error names the file.

## Connect Google (optional)

1. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` and a `TOKEN_ENCRYPTION_KEY`
   (`openssl rand -base64 32`). The key is required once `GOOGLE_CLIENT_ID` is set.
2. Call `GET /api/v1/auth/google/connect` with your access token and open the returned URL in a browser (or use the
   connect button on the settings page of the web client).
3. Google redirects to `/api/v1/auth/google/callback`; the tokens are stored encrypted, then the browser is sent to
   `CLIENT_URL/settings?google=connected` (`?google=error&reason=…` on failure).

`GET /api/v1/auth/google/status` tells whether Google is connected; `DELETE /api/v1/auth/google` disconnects it.

Changing `TOKEN_ENCRYPTION_KEY` makes stored Google tokens unreadable: reconnect afterwards.

## Gmail push ingestion (optional)

Needs a connected Google account (above) and a public HTTPS URL for this server: Pub/Sub push cannot reach
`localhost`, so use a tunnel or a reverse proxy (then also set `TRUST_PROXY`, see `environment.md`).

1. In the Google Cloud project of the OAuth client, enable the Gmail API and the Pub/Sub API.
2. Create a Pub/Sub topic. Grant `gmail-api-push@system.gserviceaccount.com` the Pub/Sub Publisher role on it.
3. Create a push subscription on the topic with endpoint `https://<host>/api/v1/email/pubsub` and
   authentication enabled: choose a service account and set an audience (for example the endpoint URL).
4. Set `GMAIL_PUBSUB_TOPIC` (`projects/<project>/topics/<topic>`), `PUBSUB_PUSH_AUDIENCE` and
   `PUBSUB_PUSH_SERVICE_ACCOUNT` (the service account's email), then restart the server.
5. The server calls Gmail `users.watch` at startup and once a day at 03:00 server local time (a watch expires after 7 days). If Google was
   connected after startup, restart once so the watch is registered.

Not yet run against the real Gmail and Pub/Sub services: the watch call and the push ID token check are untested outside the fakes.

## Upgrading a database created before 2026-10-13

The migrations dated `20261013…` assume the following. Take a `pg_dump` first.

- `auth_refresh_session` deletes every refresh token: all sessions must log in again.
- `finance_integrity` fails if two transactions share an `email_log_id`. Check first:
  `SELECT email_log_id, count(*) FROM transactions WHERE email_log_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;`
- `email_drop_dedup_hash` drops `email_logs.dedup_hash`.
- Google tokens stored before this date are plaintext and can no longer be read. Clear them and reconnect:
  `UPDATE users SET google_access_token = NULL, google_refresh_token = NULL, google_token_expires_at = NULL;`

## Hand-written indexes

Two indexes cannot be expressed in `schema.prisma`: `ai_memories_embedding_hnsw`, `ai_memories_content_tsv_gin`. When creating a migration, use `npx prisma migrate dev --create-only`, read the SQL,
and delete any `DROP INDEX` for these names before applying.

## Checks

```
npx tsc --noEmit
npm run test:int
```

`npm run test:int` is the main test suite: 14 files in `server/test/integration`, about 150 s. `npm test` finds no
test files and passes.

`npm run test:e2e` is the real-flow suite (`server/test/e2e`, config `vitest.config.e2e.ts`). It reads the real
`server/.env`, uses its own database `secretary_e2e` and calls the real LLM, so it costs tokens; run it on demand. It
runs with only `MOT_API_KEY` set (while `LLM_TYPE` is `motapi`); the memory test (save and recall) is skipped without
`GEMINI_API_KEY`.

It needs Postgres and Redis (`docker compose up -d` in `server/`). Global setup creates the database
`secretary_test` if missing, applies the migrations, and pings Redis; it fails with a clear error if Redis is down.
Every test starts from truncated tables. The suite refuses any database whose name does not end in `_test`
(override the URL with `TEST_DATABASE_URL`).

- The Nest module is compiled but never initialised, so no cron job runs. The harness starts the email worker and the agent tool discovery by hand. Cron handlers are tested by calling them.
- The BullMQ queue and the `EmailProcessor` worker are real. Their Redis keys use the prefix `secretary-test`, so a dev worker on the same Redis cannot take test jobs.
- Third parties are mocked at the client boundary, so no API key is used: the chat and classification model through a scripted `LlmService`, Gemini embeddings through a scripted `GenAiProvider`, Google Calendar, Gmail and OAuth through `googleapis` spies, Telegram and Fish.audio through a URL-routed `fetch` stub that rejects unknown hosts.
- One test waits for a real retry backoff (about 15 s).

To add a test, create `server/test/integration/<name>.int-spec.ts`. Build the app with `createTestModule()`, call `resetState(ctx)` before each test, and use the helpers in `server/test/integration/support` (`seedUser`, `seedGoogleUser`, `seedEvent`, `seedEmailRule`, `createFakeGenAi`, `createFakeLlm`, `createGoogleSpies`, `createFetchStub`, `waitForJob`, `waitForStatus`, `expectRejection`).
