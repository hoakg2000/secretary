# Server code review — 2026-10-18

The scope was `server/src/` and `server/prisma/seed*.ts` on branch `investigate/motapis`. `test/` was scanned only
for duplication and convention. The review covered coding convention, duplicate code, clean code, best practice,
comments and Sonar-style critical issues. File length was excluded on purpose.

- **Method:** a read-only review by a sub-agent. Every finding was checked against the code.
- **Commands:** `tsc --noEmit` is clean. `oxlint src/ prisma/` shows 1 warning. No tests were run, and the
  cognitive-complexity figures are estimates, not Sonar output.

## Summary

The code is in good shape:
- Validation at the trust boundaries.
- `Prisma.Decimal` with atomic increment/decrement for money.
- Refresh-token rotation with replay detection.
- AES-GCM-encrypted Google tokens.
- Pub/Sub pushes verified with ID tokens.
- Email content fenced off against prompt injection.
- Shortcuts commented.

There are **no Critical findings**. The weaknesses fall into four groups:
- Boilerplate copied across modules: the response envelope, pagination, tool schemas and Google user lookup.
- Rules applied unevenly between modules: null on PATCH, `maxDecimalPlaces`, timeouts, and where tools are placed.
- A few long, deeply nested functions.
- Noise and stale comments.

**Top 5**
1. **High:** a PATCH with `null` on a required column returns 500 in calendar, character, email-rule and bank-account
   updates.
2. **Medium:** internal and upstream error text reaches the SSE client and the stored chat history.
3. **Medium:** `get_calendar_events` has no limit, and `SaveMemoryDto` scores have no bounds. The model can flood its
   own context or poison memory ranking.
4. **Medium:** malformed tool-argument JSON from MộtAPI aborts the whole chat turn instead of being reported back to
   the model.
5. **Medium (duplication):** the `{statusCode, message, data}` envelope is hand-built in about 45 handlers.
   Pagination is copied 5 times. AI tool schemas repeat their DTOs.

> Note: the reviewer also suggested moving `LLM_TYPE` / `LLM_MODELS` into environment config. They are **hardcoded on
> purpose**, by the owner's decision on 2026-10-18 (switch provider by editing one constant). Left as is.

## 1. Coding convention

| Sev | Location | Problem | Fix |
|---|---|---|---|
| Medium | `calendar.controller.ts:135-138`, `auth.controller.ts:140-143` vs `email.controller.ts:204-208`, `finance.service.ts:98,205,504`, `character.service.ts:46` | DELETE and logout responses use four different shapes (no `data`, `data: null`, `{success:true}`, the deleted row). | Use one shape (for example `data: null`). The envelope interceptor in section 2 gives this for free. |
| Medium | Tools in `email.tools.ts`, `calendar.tools.ts`, `memory.tools.ts`, but inline in `finance.service.ts:507-621` and `proactive.service.ts:117-155` | `@AiTool` methods are placed inconsistently. | Move them to `finance/finance.tools.ts` and `proactive/proactive.tools.ts`. |
| Medium | `llm/gemini.client.ts:3`, `llm/llm.module.ts:2,9-10` | `GenAiProvider` lives in `ai-agent/` but is provided by `LlmModule`, so `llm` depends on `ai-agent`. | Move `genai.provider.ts` to `src/llm/`. |
| Low | `app.module.ts:8-10,19`, `app.controller.ts:2` | `.js` import suffixes; the rest of the codebase uses none. | Drop them. |
| Low | `auth.service.ts:10` vs other files | `'crypto'` vs `'node:crypto'`. | Use `node:crypto`. |
| Low | `character.module.ts:7`, `email.module.ts:19`, `calendar.module.ts:10`, `proactive.module.ts:8` | They import `PrismaModule` again although it is `@Global()`. | Remove those imports. |
| Low | `auth.controller.ts:30` | The only controller without `@ApiTags`. | Add `@ApiTags('Auth')`. |
| Low | `auth/dto/refresh-token.dto.ts:4-6` | No Swagger decorator on the body field. | Add `@ApiPropertyOptional`. |
| Low | All controllers | `@ApiResponse` never declares a `type`, so Swagger shows no response schema. | Add a generic envelope schema once the interceptor exists. |
| Low | GET handlers (`finance.controller.ts:64,80,94`, `calendar.controller.ts:77,97`, `email.controller.ts:84,162,177`, …) | `@HttpCode(HttpStatus.OK)` on GET does nothing. | Remove it. |
| Low | `proactive.service.ts:31,77,100`, `rag-chunk.service.ts:6-10`, `token-cipher.ts:8,29`, `env.validation.ts:116,144` | English logs and messages in a codebase that is otherwise Vietnamese. | Convert to Vietnamese. `prisma/seed*.ts` can stay English (CLI-facing). |
| Low | `main.ts:34`, `app.setup.ts:10,30`, `auth.controller.ts:37`, `prisma.service.ts:12` | `process.env` read directly. The `CLIENT_URL` default is duplicated (`app.setup.ts:30`, `env.validation.ts:50`). | Use `ConfigService`. |
| Low | `email/dto/search-emails.dto.ts:8,19`, `prisma/seed-characters.ts` | Lines over 80 columns, unlike the rest of the Prettier-formatted code. | Run `npm run format`. |

## 2. Duplicate code

| Sev | Locations | Duplication | Where shared code should live |
|---|---|---|---|
| Medium | About 45 handlers (`finance.controller.ts`, `character.controller.ts:39-125`, `calendar.controller.ts:62-139`, `email.controller.ts:150-209`, `ai-agent.controller.ts:53-246`, `auth.controller.ts`) | `{ statusCode, message, data }` built by hand. | `src/common/interceptors/response-envelope.interceptor.ts` plus a `@ResponseMessage()` decorator. Skip `@Sse` and `@Res()` handlers. |
| Medium | Services `email.service.ts:128-144`, `finance.service.ts:285-329`, `chat-session.service.ts:93-129`, `memory.service.ts:131-150`; DTOs `list-email-log`, `filter-transaction`, `list-chat`, `list-memory` | Pagination copied: defaults, `skip`/`take`, `Promise.all([findMany, count])`, the result shape and the DTO validators. | `src/common/dto/pagination.dto.ts` (`PaginationDto`, composed with `IntersectionType`) and a `paginate()` helper. |
| Medium | `calendar.tools.ts:21-59,92-123`, `finance.service.ts:542-617`, `memory.tools.ts:18-64`, `email.tools.ts:19-37`, `proactive.service.ts:127-151` vs their DTOs | Tool JSON schemas repeat the DTOs, and enums are copied as literals. They already drift: `FilterTransactionDto.categoryId`, `page` and `pageSize` are missing from the tool. | Minimum: `Object.values(EnumName)`. Better: derive `type` and `required` from class-validator metadata in `discoverAiTools`. |
| Medium | `calendar-sync.service.ts:59-70`, `gmail-push.service.ts:80-90` | "Find the connected Google user, then `forUser`" written twice. | `GoogleClientFactory.forConnectedUser()`. |
| Medium | `calendar-sync.service.ts:22-26`, imported by `gmail-push.service.ts:13` | Generic Google error helpers live in a calendar file. | `src/common/google/google-errors.ts`. |
| Low | `calendar-sync.service.ts`, `gmail-push.service.ts` | The same `running` flag plus try/finally pattern. | A small `runExclusive()` helper. |
| Low | `email.service.ts:83-102` vs `147-191` | `ingest` and `reprocess` build the same result objects. | A private `routeByRule()`. |
| Low | `email.service.ts:51-54`, `email.processor.ts:180-183` | The P2002 check is written twice. | `isUniqueViolation()` in `common/prisma/prisma-errors.ts`. |
| Low | `finance.service.ts:258-260,403-414,497-499` | The INCOME/EXPENSE balance delta is written 4 times. | A private `balanceDelta()`. |
| Low | `finance.service.ts:228-235,383-397`; the not-found message at `61,111,220,375` | The category check is written twice and the message 4 times. | `assertCategoryMatches()` and a message constant. |
| Low | `finance.service.ts:288-299,437-444` | The `transactionTime` range filter is written twice. | `buildTransactionWhere()`. |
| Low | `agent.service.ts:175-178`, `email-ai.service.ts:103-106`, `proactive.service.ts:93-96` | The `APP_TIMEZONE` default is repeated 3 times. | Put the default in `EnvironmentVariables`. |
| Low | `memory.service.ts:73,108,170` | The vector literal is built 3 times. | `MemoryQueries.toVector()`. |
| Low | `memory.tools.ts:70-73` vs `memory.service.ts:80-83` | The same defaults in two places. | Keep them in `MemoryService` only. |
| Low | `ai-agent.controller.ts:141,154,177,200,263`, `auth.controller.ts:123,159,185` | `Request & { user }` retyped 8 times. | A `@CurrentUser()` decorator. |

## 3. Clean code

| Sev | Location | Problem | Fix |
|---|---|---|---|
| Medium | `agent.service.ts:279-393` (`runChat`) | 115 lines doing five jobs, with nesting 4 deep. | Extract `streamRound()` and `mergeReply()`. |
| Medium | `agent.service.ts:99-150` (`discoverAiTools`) | Nesting 5 deep. | Extract `toLlmTool()` and use early `continue`. |
| Medium | `llm/motapi.client.ts:13-93` | SSE parsing, tool-call assembly and request building in one generator. | Move generic SSE line parsing to `src/llm/sse.ts`. |
| Low | `email.processor.ts:134-202` | 10 `transaction!` / `event!` non-null assertions. | Pass the narrowed values as typed parameters. |
| Low | `chat-session.service.ts:14-36` (caller `agent.service.ts:247-252`) | `resolve()` creates or fetches depending on a positional `undefined`. | Split it into `create()` and `findOwn()`. |
| Low | `proactive.service.ts:14`, `email-rule.service.ts:143-144`, `app.controller.ts` and `app.service.ts`, `rag-chunk.service.ts` | Dead code: an unused alias, an unreachable `default`, the "Hello World" scaffold, an unused service still exported. | Remove them, or turn `GET /` into a health check. |
| Low | `email.module.ts:3,21` | `AiAgentModule` is imported but unused. | Remove the import. |
| Low | `email.module.ts:38`, `character.module.ts:10`, `calendar.module.ts:13`, `auth.module.ts:27`, `ai-agent.module.ts:24-30` | Exports with no consumer. | Trim them. |
| Low | `proactive.service.ts:80`, `gmail-push.service.ts:239`, `chat-session.service.ts:22`, `agent.service.ts:199` | Magic numbers and strings. | Name them as constants. |
| Low | `src/ai-agent/prompts/data.json` | The name does not say what it holds. | Rename it to `system-prompt.json`. |
| Low | `calendar.service.ts:41-139`, `memory.service.ts:76-94` | `const x = await …; return x;` | Return directly. |

## 4. Best practice

| Sev | Location | Problem | Fix |
|---|---|---|---|
| **High** | `calendar.service.ts:113-122`, `character.service.ts:37-40`, `email-rule.service.ts:80-87`, `finance.service.ts:71-74` | `PartialType` + `@IsOptional` let `null` through to Prisma on required columns. For example, `PATCH /calendar/:id {"startTime":null}` causes a `PrismaClientValidationError`, which the filter does not map, so the client gets **500**. The AI `update_calendar_event` tool reaches the same path. Finance transactions and memory already handle this. No test covers it. | One rule for the codebase: strip nulls on non-nullable fields, or `@ValidateIf(v => v !== null)` / `@IsDefined` in the Update DTOs. Map `PrismaClientValidationError` to 400 in `prisma-exception.filter.ts`. Add one test per module. |
| Medium | `llm/motapi.client.ts:89` (and `:45`) | `JSON.parse` of tool arguments throws inside the client, so malformed model JSON aborts the turn. This contradicts `agent.service.ts:397` ("tham số sai… được báo lại cho model"). | Catch the error, yield `args: {}` with a parse-error marker, and let `executeToolCall` answer "invalid arguments". Skip non-JSON `data:` lines. |
| Medium | `calendar.service.ts:68-86`, tool `get_calendar_events` | No `take`: every event goes into the model context and the REST response. | Cap it (for example 50) or use `PaginationDto`. |
| Medium | `ai-agent/dto/save-memory.dto.ts:25-36` (tool `save_user_memory`) | `initialScore` and `decayFactor` are unbounded. A score of `1e9` dominates retrieval. A negative decay makes a score grow without limit. | `@Min`/`@Max`, for example 0–5 for the score and 0–1 for decay. |
| Medium | `tts.service.ts:55-66` | The Fish.audio fetch has no timeout. | `AbortSignal.timeout(…)`. |
| Medium | `ai-agent.controller.ts:277-279` | The TTS pipe swallows errors and does not cancel the upstream stream when the client disconnects. | `pipeline()` from `node:stream`, with logging. |
| Low | `auth.service.ts:89-103` | The session and the refresh token are created in two separate writes, which can leave an orphan session. | Use `$transaction`. |
| Low | `auth.service.ts:121` | `payload: any`. | `verifyAsync<JwtPayload>`. |
| Low | `create-transaction.dto.ts:33`, `create-bank-account.dto.ts:38`, `create-category.dto.ts:36` | No `maxDecimalPlaces: 2`, unlike `adjust-balance.dto.ts`. | Add it. |
| Low | `finance.service.ts:48-57` (used at `:69,:81`) | It loads 10 transactions just to check that an account exists. | Use `select: {id:true}`, or rely on P2025 → 404. |
| Low | `character.service.ts:35,44`, `email-rule.service.ts:91`, `finance.service.ts:189,199,488` | They read, then write: two queries and a race. P2025 already maps to 404. | Drop the existence-only pre-reads. |
| Low | `calendar-sync.service.ts:34`, `gmail-push.service.ts:60` | The in-process `running` flag assumes a single instance, and this is not said anywhere. | Add a `shortcut:` comment. |
| Low | `email.service.ts:105-115` | The job payload copies `rawBody`, which has no size limit, into Redis. | Put only `emailLogId` and `ruleType` in the job. |
| Low | `auth.controller.ts:89-91` | `POST /auth/refresh` has no throttle. | Add `ThrottlerGuard` if wanted. |
| Low | `trigger-proactive.dto.ts:46-47` | `metadata` has no validator. | `@IsObject()`. |

## 5. Comments

- **Complex code with no comment (Low):**
  - `calendar-sync.service.ts:160`: the UUID with dashes removed is a valid Google event ID (base32hex).
  - `reply-stream.parser.ts:27-37`: the state machine assumes `REPLY_SCHEMA` is flat.
  - `gmail-push.service.ts:46`: the HTML-strip regex is a deliberate approximation.
- **Noise comments to delete:**
  - Swagger banner lines in `main.ts:12,32`.
  - The numbered step comments in `auth.service.ts:24-226`.
  - Section banners in `character.controller.ts`, `character.service.ts`, `finance.service.ts`, `finance.controller.ts`, `email.controller.ts` and `proactive.service.ts`.
  - Restating comments in `calendar.service.ts:88-108`, `email.service.ts:194-196`, `email-rule.service.ts:113-115`, `memory.service.ts:38-67`, `agent.service.ts:92-94`, `rag-chunk.service.ts:20,75,84` and `prisma.module.ts:4`.
- **Stale comments:**
  - `character.module.ts:2` and `character.service.ts:2`: "Điều chỉnh theo đường dẫn thực tế" is scaffold residue.
  - `trigger-proactive.dto.ts:43`: says "JSON string", but nothing parses a JSON string.

## 6. Sonar-style critical issues (file length excluded)

| Sev | Location | Issue |
|---|---|---|
| High | See 4.1 | A client-reachable 500 from an unhandled `PrismaClientValidationError`. |
| Medium | `agent.service.ts:264-269`, `:470-471`; `motapi.client.ts:29-30` | Information exposure. `error.message`, which can carry up to 300 characters of upstream body or Prisma text, goes to the SSE client and into `chat_messages.tool_calls`. Send a fixed message, as `tts.service.ts:13` does, and log the details. |
| Medium | `agent.service.ts:279` (`runChat`), `:99` (`discoverAiTools`), `reply-stream.parser.ts:22` (`feed`), `motapi.client.ts:13` (`stream`) | Cognitive complexity likely over 15 (estimated). |
| Low | `main.ts:39` | Floating promise `bootstrap();`. |
| Low | `common/decorators/ai-tool.decorator.ts:27` | Wrapper type `Object`. |
| Low | `motapi.client.ts:68,76` | A labelled statement (S1119); it goes away when SSE parsing is extracted. |
| Low | `calendar.service.ts:53,126,129,155`, `calendar-sync.service.ts:93,209` | `'DIRTY'` / `'SYNCED'` literals instead of the `SyncStatus` enum. |
| Low | `'email-processing'` (3 files), `'JWT-auth'` (8 files) | Duplicated literals. Export constants. |
| Low | `any` in `agent.service.ts` (6 places), `calendar-sync.service.ts:22`, `create-event.dto.ts:60` (`attendees?: any[]`, unvalidated), `email.processor.ts:62,239`, `telegram.client.ts:39`, `ai-agent.controller.ts:277` | Use `unknown` and narrowing. Use `@IsString({ each: true })` for attendees. |
| Low | `memory.tools.ts:38,67`, `proactive.service.ts:65,100` | Personal data in logs: memory content, search queries and notification text. Log IDs and lengths instead. |

## Prioritized fix list

1. Null on PATCH returns 500: fix the four update paths, map `PrismaClientValidationError` to 400, and add tests.
2. Stop sending raw error text to SSE clients and storing it in chat history.
3. Bound the `SaveMemoryDto` scores, and cap `getEvents` / `get_calendar_events`.
4. Handle malformed tool-argument JSON and bad `data:` lines in `MotApiClient`.
5. TTS: add a fetch timeout, and use `pipeline()` with cancellation.
6. Add the envelope interceptor and `@ResponseMessage`, `@CurrentUser`, `PaginationDto` / `paginate()`, and one DELETE shape.
7. Derive tool schemas from the DTOs, or at least the enums. Move the finance and proactive tools into `*.tools.ts`.
8. Shared Google helpers (`forConnectedUser`, `common/google` errors). Move `genai.provider.ts` into `llm/`.
9. Split `runChat`, `discoverAiTools` and `MotApiClient.stream`, and remove the `!` assertions.
10. Housekeeping:
    - Unused imports and exports, redundant `PrismaModule` imports.
    - The `SyncStatus` enum and queue-name constants.
    - An atomic login session.
    - `maxDecimalPlaces` on money DTOs.
    - Consistent import style.
    - Noise and stale comments.
    - The language mix.

## Not reviewed

- Migration SQL (`prisma/migrations/`).
- `test/` specs beyond a duplication and `.only` scan.
- Runtime behaviour: no tests were run.
- `graphify-out/` and `documents/`.
