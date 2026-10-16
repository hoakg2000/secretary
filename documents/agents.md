# Claude Code agents

Project subagents live in `.claude/agents/`. Claude Code loads them at session start (restart the session after adding or editing one). Claude picks an agent by its `description`; you can also name it: "use the nestjs-reviewer agent on this branch".

## Change log

| Date | Change |
|------|--------|
| 2026-10-16 | First version: 10 agents covering the life cycle from analysis to documentation. Reviewed by a subagent; fixes applied (change-log order, `db.md` ownership, schema checks, integration test needs, plan section names, trigger overlap). |
| 2026-10-16 | Removed the star counts and the plan-format reference to a deleted file; `documents/plans/` is only where a requested plan is written. |
| 2026-10-16 | Review fixes: `Change log` is a `##` heading; the mobile app is marked `[De-scoped]`; `doc-writer` and `project-analyst` list the `[De-scoped]` tag; `project-analyst` no longer names a React Native app. |

## Life cycle

```
project-analyst → solution-architect → db-architect → nestjs-developer / nextjs-developer
      → test-engineer → nestjs-reviewer / nextjs-reviewer / security-auditor → doc-writer
```

Subagents cannot start other subagents. The main session runs the chain: it calls one agent, reads its report, then calls the next. Skip steps a change does not need (no schema change → no db-architect).

## Agents

| Agent | Phase | Does | Tools | Model | Writes to |
|-------|-------|------|-------|-------|-----------|
| `project-analyst` | Analyze | Requirement → user stories, Given/When/Then acceptance criteria, impact, risks, open questions | Read, Grep, Glob, Write | opus | `documents/plans/*-analysis.md` (only when asked) |
| `solution-architect` | Design | Implementation plan with fixed sections (documents to read, scope, steps, open points, real-service checks) | Read, Grep, Glob, Write | opus | `documents/plans/` |
| `db-architect` | Database | Analyze mode: audit schema, indexes, drift with `db.md`. Change mode: edit schema, create migration with `--create-only`, check SQL for data loss. Hands `db.md` changes to doc-writer | Read, Grep, Glob, Edit, Write, Bash | opus | `server/prisma/` |
| `nestjs-developer` | Code | Server features: DTO → service → controller → module; build, lint, unit tests | Read, Grep, Glob, Edit, Write, Bash | sonnet | `server/src/` |
| `nextjs-developer` | Code | Web dashboard: App Router pages, server and client components, API calls per `api.md` | Read, Grep, Glob, Edit, Write, Bash | sonnet | `web-client/` |
| `test-engineer` | Test | Unit (`*.spec.ts`), integration (`*.int-spec.ts` with the harness), e2e; reports suspected source bugs instead of changing source | Read, Grep, Glob, Edit, Write, Bash | sonnet | test files |
| `nestjs-reviewer` | Review | Read-only review of the server diff; verdict and findings by severity with file:line | Read, Grep, Glob, Bash | opus | nothing |
| `nextjs-reviewer` | Review | Read-only review of the web-client diff: rendering boundaries, data caching, auth, accessibility | Read, Grep, Glob, Bash | opus | nothing |
| `security-auditor` | Review | Read-only audit: auth, access control, OAuth token encryption, Pub/Sub webhooks, prompt injection, `npm audit` | Read, Grep, Glob, Bash | opus | nothing |
| `doc-writer` | Document | Syncs `documents/` with the code, uses `documents/templates/`, adds change-log rows, flips `[Planned]` to `[Implemented]` | Read, Grep, Glob, Edit, Write, Bash | sonnet | `documents/` |

Reviewers and the auditor also set `disallowedTools: Edit, Write`. They still have Bash, so read-only is enforced by their prompt, not by the tool list.

File ownership: doc-writer is the only agent that edits `documents/` (except `documents/plans/`, written by project-analyst and solution-architect). Schema and migration review belongs to db-architect, not nestjs-reviewer.

Colors: there are 8 colors for 10 agents, so pairs share one. Planning agents are blue, reviewers are red and pink, the auditor is purple.

## How the agents are built

Each file follows the same layout, taken from the references below and the official docs:

1. Frontmatter: `name`, `description` (when to use it, with trigger words and "Use PROACTIVELY" where Claude should call it unasked), `tools` (least privilege), `model`, `color`.
2. Role: one line.
3. Context: real paths, commands and conventions of this repo, so the agent does not have to rediscover them.
4. Workflow: numbered steps, read first and verify last.
5. Rules: project conventions and hard "never" actions (no `migrate reset`, no real third-party calls, no commit unless asked).
6. Done when: checks that can be run.
7. Report back: a fixed structure, because only the final message returns to the main session.

What was deliberately left out of the public examples: the JSON "context manager" protocols and lists of agents to coordinate with (subagents cannot message each other in Claude Code), long generic skill lists, and fixed numeric targets (80% coverage, Web Vitals > 90) the project has not adopted.

## References

| Source | Used for |
|--------|----------|
| [Claude Code docs: subagents](https://code.claude.com/docs/en/sub-agents) | Frontmatter fields (`tools`, `disallowedTools`, `model`, `color`, ...), "use proactively" in descriptions, least privilege, project scope in `.claude/agents/` |
| [VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) | Role → invocation steps → checklist layout. Models for: `code-reviewer`, `nextjs-developer`, `backend-developer`, `postgres-pro`, `database-administrator`, `test-automator`, `qa-expert`, `business-analyst`, `technical-writer`, `documentation-engineer`, `architect-reviewer` |
| [wshobson/agents](https://github.com/wshobson/agents) | `comprehensive-review` plugin (code-reviewer, architect-review, security-auditor on opus): feedback ordered by severity, separate security auditor, opus for reviewers |
| [iannuttall/claude-agents](https://github.com/iannuttall/claude-agents) (archived) | Small, single-purpose agents (`prd-writer`, `project-task-planner`, `security-auditor`) |
| This repo | `documents/templates/` (module docs), `server/src/finance/finance.service.spec.ts` (unit test style), `server/test/integration/harness.ts` (integration harness) |

## Not included

- A debugger or DevOps agent, or a mobile agent (the React Native app is `[De-scoped]`). Add one when that work starts.
- `web-client/` is empty today. `nextjs-developer` and `nextjs-reviewer` assume only Next.js with the App Router and read the real versions from `web-client/package.json`. Make them more specific, along with the web part of `test-engineer`, once it has a `package.json`.
