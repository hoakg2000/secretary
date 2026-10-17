# Secretary — Environment variables

Validated at startup by `server/src/config/env.validation.ts`. Template: `server/.env.example`.

## Required

| Variable | Used by |
|----------|---------|
| `DATABASE_URL` | Prisma (server, migrations, seed) |
| `JWT_SECRET` (≥ 32 chars) | Access tokens, Google OAuth `state` |
| `JWT_REFRESH_SECRET` (≥ 32 chars) | Refresh tokens |
| `REDIS_HOST`, `REDIS_PORT` | BullMQ email queue |

## Optional, with defaults

| Variable | Default | Used by |
|----------|---------|---------|
| `PORT` | `3000` | HTTP server |
| `NODE_ENV` | `development` | `production` sets the `Secure` flag on the refresh cookie |
| `JWT_EXPIRES_IN` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token lifetime; also the cookie and database expiry |
| `CLIENT_URL` | `http://localhost:3000` | CORS origin |

`PORT` and `CLIENT_URL` both default to port 3000. `CLIENT_URL` is the browser origin of the dashboard, so a
dashboard served on its own port needs `CLIENT_URL` set to that origin (for example `http://localhost:3001`), or the
API needs another `PORT`. The code defaults are unchanged.

## Optional, feature-gated

| Variable | Default | Feature |
|----------|---------|---------|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | — | Google OAuth, calendar sync, Gmail push |
| `TOKEN_ENCRYPTION_KEY` | — | AES-256-GCM key for Google tokens: 32 bytes, base64. **Required when `GOOGLE_CLIENT_ID` is set.** |
| `GEMINI_API_KEY` | — | Chat, embeddings, email classification. Without it, `POST /ai-agent/memories` and `POST /ai-agent/memories/search` answer 503; the chat stream answers 200 and ends with an `error` frame (the session and the user's message are still stored); queued emails fail and end as `FAILED`. The server still starts. |
| `GEMINI_EMBEDDING_MODEL` | `gemini-embedding-001` | Must return 1536 dimensions (`outputDimensionality`) |
| `FISH_AUDIO_API_KEY` | — | TTS. Without it `POST /ai-agent/tts` answers 503. The voice comes from `characters.voice_id`. |
| `BULLMQ_CONCURRENCY` | `3` | Email worker concurrency |
| `CALENDAR_SYNC_CRON` | every 5 minutes | Calendar push-sync schedule (cron expression, 5 or 6 fields, seconds first when 6; evaluated in the server's local time, not `APP_TIMEZONE`) |
| `APP_TIMEZONE` | `Asia/Ho_Chi_Minh` | Reminder text, chat system instruction, email classification. Stored times are UTC. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | — | Telegram text delivery of proactive notifications. Without both, the dispatch status is `NOT_CONFIGURED` and nothing is sent. |
| `TRUST_PROXY` | — | Set only behind a reverse proxy or tunnel, so that `req.ip` (recorded at login, key of the login throttle) is the real client address. A number is the count of proxies in front of the server (`1`); anything else is a list of trusted addresses or subnets (`loopback`, `10.0.0.0/8`). Unset: the socket address is used. `true` and `false` are refused at startup. |
| `GMAIL_PUBSUB_TOPIC` | — | `projects/<project>/topics/<topic>`. Gmail watch target, renewed daily and at startup. |
| `PUBSUB_PUSH_AUDIENCE` | — | Audience configured on the push subscription; checked on every push. |
| `PUBSUB_PUSH_SERVICE_ACCOUNT` | — | Email of the push subscription's service account; checked on every push. Without all three Pub/Sub variables `POST /email/pubsub` answers 503. |

## Tests only

| Variable | Default | Used by |
|----------|---------|---------|
| `TEST_DATABASE_URL` | `postgresql://secretary_user:secretary_password@localhost:5432/secretary_test` | `npm run test:int` (`server/vitest.config.int.ts`). The database name must end with `_test`: the suite truncates every table and refuses any other name. The suite also needs Redis on `REDIS_HOST`/`REDIS_PORT` (set to `localhost:6379` by the config). Commented out in `.env.example`. |

## Seed only

| Variable | Used by |
|----------|---------|
| `MASTER_EMAIL`, `MASTER_PASSWORD` | `npm run seed` |
