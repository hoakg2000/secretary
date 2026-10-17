# Secretary — server

NestJS API for the personal AI assistant: auth, characters, email rules and ingestion, finance ledger,
local calendar with one-way Google push, AI agent (chat, tools, memory, TTS), proactive reminders.

- Setup and first login: [`../documents/setup.md`](../documents/setup.md)
- Environment variables: [`../documents/environment.md`](../documents/environment.md)
- Routes: [`../documents/api.md`](../documents/api.md) — Swagger at `/api/docs` is the reference
- Documents index: [`../documents/README.md`](../documents/README.md)

```
docker compose up -d
npm install
cp .env.example .env      # then fill it in
npx prisma migrate deploy
npm run seed              # characters from documents/characters + master user
npm run start:dev
```

Checks: `npx tsc --noEmit` and `npm run test:int` (needs Postgres and Redis; see `documents/setup.md`).
