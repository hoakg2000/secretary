# [Module] Service

- **Class**: `[Module]Service` — `server/src/[module]/[module].service.ts`
- **Description**: [One or two sentences: the business responsibility and the main rule it enforces.]
- **Tables**: `[table_1]`, `[table_2]` (read, write); `[table_3]` (read).
- **Callers**: `[Module]Controller`, [other services, workers or the AI agent that call it].

(A module with several classes uses this header instead of the `**Class**` bullet:)

- **Module**: `[Module]Module` — `server/src/[module]/[module].module.ts`
- **Description**: [One or two sentences.]

| Class | File (under `server/src/[module]/`) | Role |
|-------|-------------------------------------|------|
| `[Module]Service` | `[module].service.ts` | [What it does.] |
| `[Other]Service` | `[other].service.ts` | [What it does.] |

**Tables**: `[table_1]`, `[table_2]`.

---

## Methods

(A file with several classes uses one `## [ClassName]` heading per class and keeps the method numbers running.)

### 1. methodName(args)

- [What it does, in steps or short bullets: checks (with the HTTP error), writes, transaction boundaries.]
- [Known limit, when there is one: what it is and when to upgrade.]

### 2. otherMethod(args)

- [Behavior.] [State "Not an AI tool" only when readers could expect one.]

---

## AI tools

(Omit this section when the module has no `@AiTool()` method.)

| Tool | Method | Confirmation | Parameters |
|------|--------|--------------|------------|
| `[tool_name]` | `[methodName](dto)` | no | none, or `[Dto]`: `field`, `field?`. |
| `[write_tool_name]` | `[methodName](dto)` | **yes** | `[Dto]`: `field`, `field?`. [Fields the model cannot set.] |

[Write tools are parked in `PendingActionStore` and run only after `POST /ai-agent/actions/:actionId/confirm`.]
