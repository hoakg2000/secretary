# Secretary — Local setup

All commands run from `server/`. Needs Node 24 and Docker.

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
   `MASTER_PASSWORD` for step 5. The server refuses to start and names the key when a required value is missing.
4. Apply the migrations:
   ```
   npx prisma migrate deploy
   ```
5. Create the master user (safe to repeat; it updates the password):
   ```
   npm run seed
   ```
6. Start the server:
   ```
   npm run start:dev
   ```
   API under `http://localhost:3000/api/v1`, Swagger at `http://localhost:3000/api/docs`.
7. Log in: `POST /api/v1/auth/login` with the seeded email and password.

## Connect Google (optional)

1. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` and a `TOKEN_ENCRYPTION_KEY`
   (`openssl rand -base64 32`). The key is required once `GOOGLE_CLIENT_ID` is set.
2. Call `GET /api/v1/auth/google/connect` with your access token and open the returned URL in a browser.
3. Google redirects to `/api/v1/auth/google/callback`; the tokens are stored encrypted.

Changing `TOKEN_ENCRYPTION_KEY` makes stored Google tokens unreadable: reconnect afterwards.

## Upgrading a database created before 2026-10-13

The migrations dated `20261013…` assume the following. Take a `pg_dump` first.

- `auth_refresh_session` deletes every refresh token: all sessions must log in again.
- `finance_integrity` fails if two transactions share an `email_log_id`. Check first:
  `SELECT email_log_id, count(*) FROM transactions WHERE email_log_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;`
- `email_drop_dedup_hash` drops `email_logs.dedup_hash`.
- Google tokens stored before this date are plaintext and can no longer be read. Clear them and reconnect:
  `UPDATE users SET google_access_token = NULL, google_refresh_token = NULL, google_token_expires_at = NULL;`

## Hand-written indexes

Three indexes cannot be expressed in `schema.prisma`: `characters_single_active`, `ai_memories_embedding_hnsw`,
`ai_memories_content_tsv_gin`. When creating a migration, use `npx prisma migrate dev --create-only`, read the SQL,
and delete any `DROP INDEX` for these names before applying.

## Checks

```
npx tsc --noEmit
npm test
```
