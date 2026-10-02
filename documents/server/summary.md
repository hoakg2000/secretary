# Backend Server (`/server`) — Summary & Engineering Guide

## How to read this document

Stage: **general analysis, no implementation code exists yet.**

Every statement carries one of two labels:

- **[Sourced: Sx]** — taken directly from the provided documents.
  - **S1** `documents/summary.md`
  - **S2** `documents/server/summary.md`
  - **S3** `project background`
- **[Proposed]** — recommended standard based on NestJS / TypeScript best practice. Not stated in any project document. It must be reviewed and confirmed before it becomes a rule.

`documents/server/rule.md` is empty [Sourced: S-files], so nothing here overrides an existing project rule.

---

## 1. Scope

The server is built with NestJS and TypeScript. It provides RESTful APIs, user authentication, integration with AI models, interaction with Google APIs, and background job processing. [Sourced: S2]

Business capabilities the server must support [Sourced: S3 §2]: Self-Updating Semantic Memory (RAG + background extraction job), Email Summarization & Classification, Calendar Management, Automatic Expense Tracking from bank-notification emails, Periodic Reports, Chatbox with short-term history, and Voice Chat V1 (one-way TTS).

Architecture: REST API, Dependency Injection, Modular Architecture. [Sourced: S2]

---

## 2. Packages

### 2.1 Package roles and usage guidance

| Package                                 | Role [Sourced: S2]                                      | Usage guidance [Proposed]                                                                                                                                 |
| --------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nestjs/*` core                        | Framework                                               | Feature-based modules; providers injected through constructors only                                                                                       |
| `@google/genai`                         | Talks to Gemini; Tool/Function Calling                  | Wrap in a single `AiModule` service; no other module imports the SDK directly. Set request timeouts. Validate every structured output with Zod before use |
| `@nestjs/schedule` + `cron`             | Cron jobs                                               | Jobs only trigger work; business logic lives in services. Jobs must be idempotent and guard against overlapping runs                                      |
| `googleapis`                            | Gmail, Calendar, Drive access                           | Wrap in a `GoogleModule`; request minimal OAuth scopes; centralize token refresh                                                                          |
| `google-auth-library`                   | Verifies Google ID Token from the client (Google login) | Used only in the auth module for login verification                                                                                                       |
| `@nestjs/jwt`                           | Create / verify JWT                                     | Short-lived access tokens; secrets come from config only                                                                                                  |
| `@nestjs/passport` + `passport-jwt`     | Guards and auth strategies                              | One JWT strategy; apply a global auth guard, opt out with a `@Public()` decorator                                                                         |
| `argon2`                                | Password hashing                                        | Never log or return hashes; hash in the auth service only                                                                                                 |
| `Prisma`                                | Type-safe ORM, migrations, queries                      | One `PrismaService`; only repositories/services touch it; migrations committed to git                                                                     |
| `class-validator` + `class-transformer` | Validate and transform incoming DTOs                    | Request DTOs only; global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`, `transform`                                                          |
| `Zod`                                   | Flexible schema validation                              | Env config, AI structured output, external API payloads, and response schemas                                                                             |
| `@nestjs/config`                        | Reads `.env`                                            | Validate env with a Zod schema at boot; fail fast; keep `.env.example` current                                                                            |
| `@nestjs/axios` + `axios`               | HTTP client for 3rd-party APIs                          | Used for Fish.audio and other non-SDK calls; set timeout and retry policy                                                                                 |

### 2.2 Packages not listed in the sources but implied by requirements [Proposed]

These are open decisions, not confirmed dependencies.

| Need             | Evidence                                             | Candidate                                                               |
| ---------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| Queue            | S1 lists "Background Jobs/Queue"; S2 lists only Cron | A queue library (e.g. BullMQ + Redis), or cron-only if volume stays low |
| Vector DB client | S1: pgvector or Qdrant                               | Client depends on the final choice (see Section 13)                     |
| API docs         | None                                                 | `@nestjs/swagger`                                                       |
| Logging          | None                                                 | `nestjs-pino` or the built-in Logger                                    |
| Rate limiting    | None                                                 | `@nestjs/throttler`                                                     |
| Security headers | None                                                 | `helmet`                                                                |
| Testing          | None                                                 | `jest`, `supertest` (NestJS default tooling)                            |

---

## 3. Project Structure

The sources give only this reference structure: `src/`, `prisma/schema.prisma`, `.env.example`, `nest-cli.json`, `package.json`, `tsconfig.json`. [Sourced: S2]

The layout inside `src/` below is **[Proposed]**: feature modules mapped from the feature list in S3.

```text
server/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── main.ts                    # bootstrap, global pipes/filters/interceptors
│   ├── app.module.ts
│   ├── config/                    # env schema (Zod), config factories
│   ├── common/
│   │   ├── decorators/            # @Public(), @CurrentUser()
│   │   ├── errors/                # AppException, error-code registry
│   │   ├── filters/               # global exception filter
│   │   ├── guards/
│   │   ├── interceptors/          # response envelope, logging
│   │   ├── pipes/
│   │   └── types/
│   ├── infra/
│   │   ├── prisma/                # PrismaService
│   │   ├── ai/                    # Gemini wrapper (@google/genai)
│   │   ├── google/                # googleapis wrapper (Gmail, Calendar)
│   │   ├── tts/                   # Fish.audio client
│   │   └── vector/                # vector DB wrapper
│   └── modules/
│       ├── auth/
│       ├── user/
│       ├── chat/
│       ├── memory/                # RAG retrieval + extraction job
│       ├── email/                 # intake, classify, summarize
│       ├── calendar/
│       ├── expense/
│       ├── report/
│       └── voice/
├── test/
├── .env.example
├── nest-cli.json
├── package.json
└── tsconfig.json
```

Rules for the layout [Proposed]:

- `modules/*` hold business features. `infra/*` hold wrappers around external systems.
- A feature module never imports an external SDK directly; it goes through `infra/*`.
- `common/` has no dependency on any feature module.

### 3.1 Standard layout inside one feature module [Proposed]

```text
modules/<feature>/
├── <feature>.module.ts
├── <feature>.controller.ts
├── <feature>.service.ts
├── <feature>.repository.ts        # only Prisma access for this feature
├── dto/
│   ├── <action>-<feature>.request.dto.ts
│   └── <feature>.response.dto.ts
├── schemas/                       # Zod schemas (response / AI / external data)
├── mappers/                       # entity → response DTO
├── <feature>.errors.ts            # feature error codes
├── <feature>.constants.ts
├── <feature>.types.ts
├── jobs/                          # cron / queue processors (if any)
└── tests/
```

---

## 4. Naming Convention [Proposed]

| Item                                    | Convention                                               | Example                                              |
| --------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| Files and folders                       | `kebab-case` with role suffix                            | `create-event.request.dto.ts`, `calendar.service.ts` |
| Classes, interfaces, types, enums       | `PascalCase`                                             | `CalendarService`, `CreateEventRequestDto`           |
| Interfaces                              | No `I` prefix                                            | `ExpenseParser`                                      |
| Variables, functions, methods           | `camelCase`                                              | `parseBalanceEmail()`                                |
| Constants                               | `UPPER_SNAKE_CASE`                                       | `MAX_CONTEXT_TOKENS`                                 |
| Enum members                            | `UPPER_SNAKE_CASE`                                       | `EmailCategory.BANK_NOTICE`                          |
| Booleans                                | `is` / `has` / `can` prefix                              | `isProcessed`                                        |
| DTOs                                    | `<Action><Entity>.request.dto` / `<Entity>.response.dto` | `CreateEventRequestDto`                              |
| Zod schemas                             | `<name>Schema`; inferred type `<name>`                   | `expenseExtractionSchema`                            |
| Guards / Pipes / Filters / Interceptors | `<Name>Guard` etc.                                       | `JwtAuthGuard`                                       |
| Prisma models                           | `PascalCase`, singular                                   | `ChatMessage`                                        |
| Prisma fields                           | `camelCase`                                              | `createdAt`                                          |
| DB tables / columns                     | `snake_case` via `@@map` / `@map`                        | `chat_messages`, `created_at`                        |
| Error codes                             | `<DOMAIN>_<NNN>`                                         | `AUTH_001`                                           |
| REST routes                             | plural nouns, `kebab-case`, no verbs                     | `/calendar-events`                                   |
| Env variables                           | `UPPER_SNAKE_CASE`, grouped by prefix                    | `GEMINI_API_KEY`                                     |
| Cron / queue jobs                       | `<feature>.<action>`                                     | `memory.extract`                                     |

---

## 5. API Flow Structure

A single API request goes through the following layers [Proposed]:

```text
Request
  → Global middleware (helmet, request id, logging)
  → Auth guard (JWT; skipped by @Public())
  → ValidationPipe (request DTO: class-validator)
  → Controller
  → Service (business logic)
  → Repository / infra client (DB, Gemini, Google, Fish.audio)
  → Mapper + response schema validation (Zod)
  → Response interceptor (envelope)
  → Response
  ↘ any thrown error → Global exception filter → error envelope
```

### 5.1 File roles

| File                             | Responsibility                                                           | Must NOT                                        |
| -------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------- |
| `*.request.dto.ts`               | Shape and validation of input (body, query, params)                      | Contain business logic                          |
| `*.controller.ts`                | Route, auth decorators, bind DTO, call one service method, return result | Access DB; contain business rules; catch errors |
| `*.service.ts`                   | Business logic, orchestration, transactions, throw `AppException`        | Know HTTP details (req/res); build envelope     |
| `*.repository.ts`                | All Prisma queries for the feature                                       | Contain business rules                          |
| `infra/*` wrappers               | Talk to external systems; translate vendor errors into `AppException`    | Leak vendor types or raw errors to services     |
| `mappers/*`                      | Convert entity → response DTO; strip internal fields                     | Query data                                      |
| `*.response.dto.ts` / `schemas/` | Shape of output; validated before returning                              | —                                               |
| `*.errors.ts`                    | Feature-specific error codes                                             | —                                               |
| `jobs/*`                         | Trigger background work                                                  | Contain business logic                          |

### 5.2 Request validation vs response validation

- Request: `class-validator` DTO through the global `ValidationPipe`. [Proposed]
- Response: map to a response DTO and validate with a Zod schema when the data comes from AI or an external source; plain mapper otherwise. [Proposed]
- Both libraries are confirmed as in use; the split of duties is the proposal. [Sourced: S2]

### 5.3 Success response envelope [Proposed]

```json
{
  "success": true,
  "data": {},
  "meta": { "requestId": "…", "timestamp": "…" }
}
```

Lists add `meta.pagination` (`page`, `limit`, `total`). Pagination is mandatory for any list endpoint.

---

## 6. Error Handling

### 6.1 Try / catch rules [Proposed]

1. Controllers do **not** use try/catch. Errors propagate to the global filter.
2. Services throw `AppException` for expected business failures. They do not return error objects or `null` to signal errors.
3. Use try/catch **only** at boundaries where a foreign error must be translated or handled:
   - `infra/*` wrappers around Gemini, Google APIs, Fish.audio, and the vector DB.
   - Prisma calls where a specific known error code is mapped.
   - Background jobs (each job catches, logs, and decides retry or skip).
4. Never swallow an error silently. Either handle it meaningfully or rethrow.
5. When rethrowing, wrap in `AppException` and keep the original as `cause`.
6. Never expose stack traces, SQL, vendor messages, or tokens in a response.
7. Do not use try/catch for control flow.

### 6.2 `AppException`

One exception class carrying: `code` (from the registry), `httpStatus`, `message` (safe, user-facing), optional `details`, and optional `cause` (internal only). [Proposed]

### 6.3 Global exception filter [Proposed]

A single filter registered in `main.ts` catches everything and returns the error envelope:

```json
{
  "success": false,
  "error": {
    "code": "AUTH_001",
    "message": "Invalid credentials",
    "details": null
  },
  "meta": { "requestId": "…", "timestamp": "…" }
}
```

Mapping order:

| Thrown                                | Result                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------- |
| `AppException`                        | Use its own code and status                                               |
| Validation failure (`ValidationPipe`) | `COMMON_400`-class validation code, field errors in `details`             |
| Nest `HttpException`                  | Mapped to the closest common code                                         |
| Prisma known error                    | Mapped (see 6.4)                                                          |
| Anything else                         | `COMMON_500`; full error logged with request id; generic message returned |

### 6.4 Error code registry [Proposed]

Format `<DOMAIN>_<NNN>`; codes are stable and never reused. The tables below are the starting set; each feature adds its own.

**Common**

| Code         | HTTP | Situation                                                       |
| ------------ | ---- | --------------------------------------------------------------- |
| `COMMON_001` | 400  | Request validation failed                                       |
| `COMMON_002` | 404  | Resource not found                                              |
| `COMMON_003` | 409  | Resource conflict / unique constraint violated (Prisma `P2002`) |
| `COMMON_004` | 429  | Rate limit exceeded                                             |
| `COMMON_500` | 500  | Unexpected internal error                                       |

**Auth**

| Code       | HTTP | Situation                                 |
| ---------- | ---- | ----------------------------------------- |
| `AUTH_001` | 401  | Invalid credentials                       |
| `AUTH_002` | 401  | Access token missing, invalid, or expired |
| `AUTH_003` | 401  | Google ID token verification failed       |
| `AUTH_004` | 403  | Authenticated but not permitted           |

**External dependencies**

| Code         | HTTP | Situation                                         |
| ------------ | ---- | ------------------------------------------------- |
| `AI_001`     | 502  | Gemini request failed                             |
| `AI_002`     | 504  | Gemini request timed out                          |
| `AI_003`     | 422  | AI output failed schema validation                |
| `GOOGLE_001` | 502  | Google API request failed                         |
| `GOOGLE_002` | 401  | Google authorization missing, revoked, or expired |
| `TTS_001`    | 502  | Fish.audio request failed                         |
| `VECTOR_001` | 502  | Vector DB request failed                          |

**Feature-specific starters**

| Code           | HTTP | Situation                                               |
| -------------- | ---- | ------------------------------------------------------- |
| `EMAIL_001`    | 422  | Email could not be classified or summarized             |
| `EXPENSE_001`  | 422  | Balance/transaction data could not be parsed from email |
| `CALENDAR_001` | 404  | Calendar event not found                                |
| `MEMORY_001`   | 500  | Memory extraction or update failed                      |

Prisma mapping: `P2002` → `COMMON_003`, `P2025` → `COMMON_002`; others → `COMMON_500`.

### 6.5 Background job errors [Proposed]

- A job failure never crashes the process.
- Log with job name, run id, and error code.
- Define per job: retry or skip, max attempts, and what happens to the item that failed.

---

## 7. Authentication and Security

Sourced facts: Google ID Token from the client is verified on the server for Google login; JWT sustains the session; Passport guards protect the API; passwords are hashed with Argon2. [Sourced: S2] The system serves a single user. [Sourced: S1, S3]

Proposed practices:

- Global JWT guard; public routes opt out explicitly with `@Public()`.
- Short-lived access token; refresh-token strategy to be decided (Section 13).
- Store Google OAuth tokens encrypted at rest; never log tokens, email bodies, or chat content.
- Enable CORS with an explicit allow-list; use `helmet`; apply rate limiting.
- Secrets only from environment variables; `.env` never committed.

---

## 8. Data Layer (Prisma + MySQL)

Stored in the RDBMS [Sourced: S1 §1.2]: User, Chat History, Settings, Raw Emails, Events.

Proposed practices:

- A single `PrismaService`; one repository per feature; services never call Prisma directly.
- Multi-step writes use transactions.
- Always `select` only needed fields; never return a Prisma entity directly from a controller.
- Indexes defined for foreign keys and for fields used in filters (e.g. email received time, expense date).
- Migrations are reviewed and committed; no manual schema drift.
- Idempotency keys for ingested data (e.g. unique external message id for emails) so reprocessing never duplicates rows.

---

## 9. AI Integration (Gemini)

Sourced: Gemini via `@google/genai`, including Tool/Function Calling, is used for NLP, rules, memory extraction, and context management. [Sourced: S1, S2]

Proposed practices:

- All Gemini calls go through one `AiService`; model name, temperature, and timeout come from config.
- Tools exposed to the model are registered in one place; each tool has a Zod input schema and a service handler.
- Any AI output consumed by code must be schema-validated; on failure raise `AI_003`.
- Prompts are versioned constants/files, not inline strings scattered in services.
- Token budget enforced before each call (context trimming), consistent with the requirement to avoid exceeding the model's token limit. [Sourced: S3 §2]
- Out-of-scope or overly complex requests are declined gracefully. [Sourced: S3 §2 "Chatbox"]

---

## 10. Google Integration

Sourced: Gmail and Google Calendar integration through `googleapis`; a dedicated routing email is the intake channel; calendar operations use the main email's credentials. [Sourced: S2, S3 §2]

Proposed practices:

- One `GoogleModule` owns the OAuth client, token refresh, and API wrappers.
- Minimal scopes; handle revoked/expired authorization with `GOOGLE_002`.
- Retry with backoff on transient errors only; respect API quotas.
- Mark processed emails by external id so polling is idempotent.

---

## 11. Background Jobs

Sourced: scheduled work uses `@nestjs/schedule` (cron). [Sourced: S2] Background jobs include memory extraction from chat sessions and periodic reports. [Sourced: S3 §2]

Proposed practices:

- Job classes are thin; logic lives in services.
- Idempotent, with an overlap guard (no second run while one is active).
- Each job logs start, end, duration, and item counts.
- Cron expressions and enable flags come from config.

---

## 12. Cross-Cutting Practices [Proposed]

| Area          | Practice                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| Config        | Zod-validated env at boot; `.env.example` always in sync                                               |
| Logging       | Structured JSON logs with request id; redact secrets and personal content                              |
| API docs      | OpenAPI via Swagger; every endpoint documented                                                         |
| Versioning    | URI prefix `/api/v1`                                                                                   |
| Health        | `/health` endpoint for Docker / VPS checks                                                             |
| Testing       | Unit tests for services and parsers; e2e tests for each API flow; mocks for Gemini, Google, Fish.audio |
| TypeScript    | `strict` mode on; no `any` without justification                                                       |
| Lint / format | ESLint + Prettier enforced in CI                                                                       |
| Docker        | Multi-stage build; run as non-root; config via env (deployment target: Docker [Sourced: S1])           |

---

## 13. Open Decisions

| #   | Decision                                          | Why it is open                                                                                                                    |
| --- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Queue library or cron-only                        | S1 says "Background Jobs/Queue"; S2 lists only `@nestjs/schedule`                                                                 |
| 2   | Vector DB: pgvector vs Qdrant                     | S1/S3 allow either. pgvector is a PostgreSQL extension while the RDBMS is MySQL, so choosing it may require a PostgreSQL instance |
| 3   | Mobile platform scope                             | S3: iOS/Android; S1: Android                                                                                                      |
| 4   | Refresh-token strategy                            | Not specified                                                                                                                     |
| 5   | Confirm all **[Proposed]** items in this document | None is project-confirmed                                                                                                         |
