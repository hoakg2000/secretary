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

## Optional, feature-gated

| Variable | Default | Feature |
|----------|---------|---------|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | — | Google OAuth, calendar sync |
| `TOKEN_ENCRYPTION_KEY` | — | AES-256-GCM key for Google tokens: 32 bytes, base64. **Required when `GOOGLE_CLIENT_ID` is set.** |
| `GEMINI_API_KEY` | — | Chat and embeddings. Without it those routes answer 503; the server still starts. |
| `GEMINI_EMBEDDING_MODEL` | `gemini-embedding-001` | Must return 1536 dimensions (`outputDimensionality`) |
| `FISH_AUDIO_API_KEY` | — | TTS. Without it `POST /ai-agent/tts` answers 503. |
| `FISH_AUDIO_DEFAULT_VOICE_ID` | — | Voice when neither the request nor the active character has one |
| `BULLMQ_CONCURRENCY` | `3` | Email worker concurrency |
| `CALENDAR_SYNC_CRON` | every 5 minutes | Calendar push-sync schedule (6-field cron expression) |
| `APP_TIMEZONE` | `Asia/Ho_Chi_Minh` | Reminder text, chat system instruction. Stored times are UTC. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | — | Telegram text delivery of proactive notifications. Without both, the dispatch status is `NOT_CONFIGURED` and nothing is sent. |
| `TRUST_PROXY` | — | Set only behind a reverse proxy or tunnel, so that `req.ip` (recorded at login, key of the login throttle) is the real client address. A number is the count of proxies in front of the server (`1`); anything else is a list of trusted addresses or subnets (`loopback`, `10.0.0.0/8`). Unset: the socket address is used. |
| `GMAIL_PUBSUB_TOPIC` | — | `projects/<project>/topics/<topic>`. Gmail watch target, renewed daily and at startup. |
| `PUBSUB_PUSH_AUDIENCE` | — | Audience configured on the push subscription; checked on every push. |
| `PUBSUB_PUSH_SERVICE_ACCOUNT` | — | Email of the push subscription's service account; checked on every push. Without all three Pub/Sub variables `POST /email/pubsub` answers 503. |

## Seed only

| Variable | Used by |
|----------|---------|
| `MASTER_EMAIL`, `MASTER_PASSWORD` | `npm run seed` |
