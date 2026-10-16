# [Module] Service

- **Class**: `[Module]Service` — `server/src/[module]/[module].service.ts`
- **Description**: [One or two sentences: the business responsibility and the main rule it enforces.]
- **Tables**: `[table_1]`, `[table_2]` (read, write); `[table_3]` (read).
- **Callers**: `[Module]Controller`, [other services, workers or the AI agent that call it].

Status tags: `[Implemented]` = in the code today. `[Planned]` = designed, not built. `[De-scoped]` = decided against; never flip it to `[Implemented]` without the owner. Put one after each method heading, or on the class heading when all its methods share it.

## Change log

| Date | Change |
|------|--------|
| YYYY-MM-DD | What changed and why. |
| 2026-10-16 | Rewritten from the module docs (review 2026-10-16): header bullets, `## Methods`, AI tools table with placeholder names (the `get_financial_summary` example with invented parameters is gone), `[De-scoped]` tag. |

---

## Methods

(A file with several classes uses one `## [ClassName]` heading per class and keeps the method numbers running.)

### 1. [methodName](args) `[Implemented]`

- [What it does, in steps or short bullets: checks (with the HTTP error), writes, transaction boundaries.]
- [Known limit, when there is one: what it is and when to upgrade.]

### 2. [otherMethod](args) `[Implemented]`

- [Behavior.] [State "Not an AI tool" only when readers could expect one.]

---

## AI tools

(Omit this section when the module has no `@AiTool()` method.)

| Tool | Method | Confirmation | Parameters |
|------|--------|--------------|------------|
| `[tool_name]` | `[methodName](dto)` | no | none, or `[Dto]`: `field`, `field?`. |
| `[write_tool_name]` | `[methodName](dto)` | **yes** | `[Dto]`: `field`, `field?`. [Fields the model cannot set.] |

[Write tools are parked in `PendingActionStore` and run only after `POST /ai-agent/actions/:actionId/confirm`.]
