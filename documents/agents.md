# Claude Code agents

Project subagents live in `.claude/agents/`. Claude Code loads them at session start (restart the session after adding or editing one). Claude picks an agent by its `description`; you can also name it: "use the nestjs-reviewer agent on this branch".

## Life cycle

```
project-analyst → solution-architect → db-architect → nestjs-developer / nextjs-developer
      → test-engineer → nestjs-reviewer / nextjs-reviewer / security-auditor → doc-writer
```

Subagents cannot start other subagents. The main session runs the chain: it calls one agent, reads its report, then calls the next. Skip steps a change does not need (no schema change → no db-architect).

## Agents

| Agent | Phase | Does | Tools | Model | Writes to |
|-------|-------|------|-------|-------|-----------|
| `project-analyst` | Analyze | Requirement → user stories, Given/When/Then acceptance criteria, impact, risks, open questions | Read, Grep, Glob, Write | opus | an analysis file in the repo's plans folder (only when asked) |
| `solution-architect` | Design | Implementation plan with fixed sections (documents to read, scope, steps, open points, real-service checks) | Read, Grep, Glob, Write | opus | the plans folder (only when asked) |
| `db-architect` | Database | Analyze mode: audit schema, indexes, drift between schema, migrations and docs. Change mode: edit schema, create migration with `--create-only`, check SQL for data loss. Hands doc changes to doc-writer | Read, Grep, Glob, Edit, Write, Bash | opus | schema and migrations |
| `nestjs-developer` | Code | Server features: DTO → service → controller → module; build, lint, tests | Read, Grep, Glob, Edit, Write, Bash | sonnet | server source |
| `nextjs-developer` | Code | Web dashboard: App Router pages, server and client components, API calls per the documented API contract | Read, Grep, Glob, Edit, Write, Bash | sonnet | web client source |
| `test-engineer` | Test | Unit, integration and e2e tests, whichever the repo has, in its existing style; reports suspected source bugs instead of changing source | Read, Grep, Glob, Edit, Write, Bash | sonnet | test files |
| `nestjs-reviewer` | Review | Read-only review of the server diff; verdict and findings by severity with file:line | Read, Grep, Glob, Bash | opus | nothing |
| `nextjs-reviewer` | Review | Read-only review of the web-client diff: rendering boundaries, data caching, auth, accessibility | Read, Grep, Glob, Bash | opus | nothing |
| `security-auditor` | Review | Read-only audit: auth, access control, OAuth token encryption, Pub/Sub webhooks, prompt injection, `npm audit` | Read, Grep, Glob, Bash | opus | nothing |
| `doc-writer` | Document | Syncs the project documents with the code and follows the repo's doc templates | Read, Grep, Glob, Edit, Write, Bash | sonnet | the project documents |

Reviewers and the auditor also set `disallowedTools: Edit, Write`. They still have Bash, so read-only is enforced by their prompt, not by the tool list.

File ownership: doc-writer is the only agent that edits the project documents (except plans, written by project-analyst and solution-architect). Schema and migration review belongs to db-architect, not nestjs-reviewer.

Colors: there are 8 colors for 10 agents, so pairs share one. Planning agents are blue, reviewers are red and pink, the auditor is purple.

## How the agents are built

Each file follows the same layout, taken from the references below and the official docs:

1. Frontmatter: `name`, `description` (when to use it, with trigger words and "Use PROACTIVELY" where Claude should call it unasked), `tools` (least privilege), `model`, `color`.
2. Role: one line.
3. Context: the stack the agent works in, and how to find this repo's conventions at run time (README, CLAUDE.md, docs index, existing files of the same kind). The code is the source of truth and the docs follow it.
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
| This repo | The doc templates and existing source files, read by each agent at run time |

## Not included

- A debugger or DevOps agent, or a mobile agent (the mobile app is dropped, see `summary.md` section 3). Add one when that work starts.
- The Next.js agents assume only Next.js with the App Router and read the real versions from the web client's `package.json`. If there is no web client yet, they stop and report it.
