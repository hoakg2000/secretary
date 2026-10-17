# Secretary — Documents

When a document and the code disagree, the code wins. Documents describe what the code does today; what is not built is listed in `summary.md` section 3. Git history is the change record.

## Index

| File | Content |
|------|---------|
| `summary.md` | Product description, repository folders, and the list of planned and dropped work. |
| `api.md` | HTTP routes of the server: path, auth, purpose. Swagger at `/api/docs` has the shapes. |
| `db.md` | Database tables, columns, indexes and `onDelete` rules; the schema reference. |
| `environment.md` | Environment variables: required, optional, feature-gated, tests only, seed only. |
| `setup.md` | Local setup, Google and Gmail push setup, database upgrade notes, checks. |
| `agents.md` | The Claude Code subagents in `.claude/agents/` and how they chain. |
| `modules/auth/` | `auth.controller.md`, `auth.service.md`: login, refresh rotation, Google OAuth. |
| `modules/character/` | `character.controller.md`, `character.service.md`: characters, their system prompt and the character JSON format. |
| `modules/email/` | `email.controller.md`, `email.service.md`, `email.worker.md`, `email-flow.mermaid.live`: ingest, rules, queue worker. |
| `modules/finance/` | `finance.controller.md`, `finance.service.md`, `finance-flow.mermaid.live`: accounts, categories, transactions. |
| `modules/calendar/` | `calendar.controller.md`, `calendar.service.md`, `calendar-flow.mermaid.live`: local calendar, one-way Google push. |
| `modules/proactive/` | `proactive.controller.md`, `proactive.service.md`: Telegram notifications, reminder cron, `send_proactive_notification` AI tool. |
| `modules/ai/` | `ai.controller.md`, `ai.service.md`, `ai-flow.mermaid.live`: chat, chat storage, memory, TTS, AI tools. |
| `characters/` | `*.json`: character profiles loaded by `npm run seed` (format in `modules/character/character.service.md`). |
| `flows/modules.mmd` | Diagram of all modules and how they connect. |
| `configs/AiTool-Decorator.md` | The `@AiTool()` decorator and how tools are discovered. |
| `templates/` | `controller.md` and `service.md`: structure for a new module doc. |
