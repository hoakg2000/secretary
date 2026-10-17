# server/ — working rules

## Before every commit that touches `server/`

Run these from `server/` and commit only when all pass. Treat them as the CI gate: there is no hook or pipeline that
runs them for you.

1. Type check: `npx tsc --noEmit`
2. Lint: `npx oxlint src/ test/`
3. Integration tests for the edited area (table below):
   `npx vitest run --config ./vitest.config.int.ts <spec files>`
   Example: `npx vitest run --config ./vitest.config.int.ts test/integration/finance.int-spec.ts test/integration/email-worker.int-spec.ts`

The tests need Postgres and Redis: `docker compose up -d`. If they are not running, start them; never commit untested
code because the containers were down.

If a check fails, fix the cause. Never skip, delete or weaken a test, add `.skip`/`.only`, or disable a type or lint
rule to get green. If a failure is unrelated to the change, report it instead of committing.

## Which specs to run

Specs live in `test/integration/`. Run every spec listed for each folder you changed (union of rows).

| Changed path | Specs |
|---|---|
| `src/auth/**` | `auth`, `misc` |
| `src/character/**` | `character`, `chat` |
| `src/finance/**` | `finance`, `email-worker`, `chat` |
| `src/calendar/**` | `calendar`, `email-worker`, `proactive`, `chat` |
| `src/email/**` | `email`, `email-worker`, `gmail-push` |
| `src/proactive/**` | `proactive`, `email-worker`, `chat` |
| `src/ai-agent/services/memory/**`, `src/ai-agent/tools/**`, `src/ai-agent/queries/**`, `rag-chunk/**` | `memory`, `chat` |
| `src/llm/**` | `llm`, `chat`, `email-worker`, `memory` |
| `src/ai-agent/services/tts/**` | `tts` |
| other `src/ai-agent/**` (agent, chat, controller, DTOs, `genai.provider.ts`) | `chat`, `memory`, `tts`, `misc` |
| `src/common/**`, `src/config/**`, `src/prisma/**`, `src/app.*`, `src/main.ts`, `prisma/schema.prisma`, `prisma/migrations/**`, `test/integration/harness.ts`, `test/integration/support/**`, `test/integration/global-setup.ts`, `vitest.config*.ts`, `package.json` | full suite: `npm run test:int` |
| a spec file itself | that spec |
| docs only (`*.md`), no code | none |

Spec name `x` means `test/integration/x.int-spec.ts`. When unsure, run the full suite (about 2.5 minutes).

## New code

A new service method or branch gets a test in the matching spec. Tests use the real database and queue through
`createTestModule()` / `resetState()` from `test/integration/harness.ts`; third parties are faked only at the client
boundary (see `documents/setup.md`, section "Checks"). A new module adds a row to the table above.
