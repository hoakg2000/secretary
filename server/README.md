# Secretary — server

NestJS API for the personal AI assistant: auth, characters, email rules and ingestion, finance ledger,
local calendar with one-way Google push, AI agent (chat, tools, memory, TTS), proactive reminders.

- Setup and first login: [`../documents/setup.md`](../documents/setup.md)
- Environment variables: [`../documents/environment.md`](../documents/environment.md)
- Routes: [`../documents/api.md`](../documents/api.md) — Swagger at `/api/docs` is the reference
- Plan and decisions: [`../documents/plan.md`](../documents/plan.md), [`../documents/decisions.md`](../documents/decisions.md)

```
docker compose up -d
npm install
cp .env.example .env      # then fill it in
npx prisma migrate deploy
npm run seed
npm run start:dev
```

Checks: `npx tsc --noEmit` and `npm test`.
