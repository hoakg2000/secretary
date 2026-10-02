# Backend Review Checklist (Project-Specific Rules)

Status: **all rules below are [Proposed]** and derive from `server-summary.md`. They become binding only after confirmation.

Scope: only rules specific to this project. Common practices (formatting, no dead code, meaningful commit messages, etc.) are intentionally excluded.

Section references (§) point to `server-summary.md`.

---

## A. Structure and Layering (§3, §5)

- [ ] **A1** New feature lives in `modules/<feature>/` using the standard file set (module, controller, service, repository, dto, mappers, errors).
- [ ] **A2** Controller only binds DTO, calls one service method, and returns. No DB access, no business rules, no try/catch.
- [ ] **A3** Only `*.repository.ts` (or `infra/prisma`) touches Prisma.
- [ ] **A4** External SDKs (`@google/genai`, `googleapis`, Fish.audio, vector DB client) are imported only inside `infra/*`.
- [ ] **A5** `common/` imports nothing from `modules/`.
- [ ] **A6** Cron/queue job classes contain no business logic.

## B. Naming (§4)

- [ ] **B1** File names are `kebab-case` with the role suffix (`.controller.ts`, `.service.ts`, `.request.dto.ts`, …).
- [ ] **B2** DB tables/columns are `snake_case` via `@@map`/`@map`; Prisma models are singular `PascalCase`.
- [ ] **B3** Routes are plural, `kebab-case` nouns; no verbs in paths.
- [ ] **B4** Zod schemas are named `<name>Schema` with the inferred type exported alongside.

## C. API Flow (§5)

- [ ] **C1** Every endpoint has request DTO(s) for body/query/params with validation decorators.
- [ ] **C2** Every endpoint returns a response DTO via a mapper; no Prisma entity or vendor object is returned directly.
- [ ] **C3** Data originating from AI or external APIs is validated with a Zod schema before being returned or persisted.
- [ ] **C4** Responses use the standard envelope (`success`, `data`/`error`, `meta`).
- [ ] **C5** Every list endpoint is paginated.
- [ ] **C6** Non-public endpoints rely on the global guard; any `@Public()` is justified in the PR.
- [ ] **C7** Endpoint is documented in Swagger.

## D. Error Handling (§6)

- [ ] **D1** Expected failures throw `AppException` with a registered code; no bare `Error`, no `null`/error-object returns.
- [ ] **D2** Any new error code is added to the registry with HTTP status and situation; codes are never reused or renumbered.
- [ ] **D3** try/catch appears only in `infra/*` wrappers, mapped Prisma calls, or background jobs.
- [ ] **D4** No empty catch blocks; rethrown errors keep the original as `cause`.
- [ ] **D5** Responses never expose stack traces, SQL, vendor messages, or tokens.
- [ ] **D6** Vendor errors (Gemini, Google, Fish.audio, vector DB) are translated to the registered external-dependency codes.
- [ ] **D7** Prisma `P2002` and `P2025` are handled via the shared mapping, not ad hoc.

## E. AI / Gemini (§9)

- [ ] **E1** All Gemini calls go through `AiService`; model, temperature, and timeout come from config.
- [ ] **E2** Every function-calling tool has a Zod input schema and is registered in the central tool registry.
- [ ] **E3** AI output used by code is schema-validated; failure raises `AI_003`.
- [ ] **E4** Prompts are versioned constants/files, not inline strings.
- [ ] **E5** Context size is trimmed to the token budget before each call.
- [ ] **E6** Prompts and logs do not contain unnecessary raw personal content.

## F. Google Integration and Ingestion (§10, §8)

- [ ] **F1** Google access only through `GoogleModule`; scopes are minimal.
- [ ] **F2** Google OAuth tokens are stored encrypted and never logged.
- [ ] **F3** Ingested emails are keyed by external message id; reprocessing never creates duplicates.
- [ ] **F4** Expense extraction parses email text only (no OCR/Vision) [Sourced: S3] and failures raise `EXPENSE_001` without losing the raw email.
- [ ] **F5** Retries apply only to transient errors, with backoff.

## G. Background Jobs (§11)

- [ ] **G1** Job is idempotent and protected against overlapping runs.
- [ ] **G2** Job catches its own errors, logs job name/run id/error code, and never crashes the process.
- [ ] **G3** Retry/skip policy and max attempts are defined.
- [ ] **G4** Cron expression and enable flag come from config.

## H. Data Layer (§8)

- [ ] **H1** Schema change includes a committed migration.
- [ ] **H2** Multi-step writes are wrapped in a transaction.
- [ ] **H3** Queries select only the fields needed.
- [ ] **H4** New filter/foreign-key fields have indexes.

## I. Config and Security (§2, §7, §12)

- [ ] **I1** New env variable is added to the Zod env schema and `.env.example`.
- [ ] **I2** No secret or token appears in code, logs, or responses.
- [ ] **I3** Passwords are hashed only with `argon2` in the auth service; hashes are never returned or logged.
- [ ] **I4** New dependencies are justified in the PR and listed in the summary document.

## J. Tests (§12)

- [ ] **J1** Service logic and parsers have unit tests.
- [ ] **J2** Each new API flow has an e2e test covering success and at least one error code.
- [ ] **J3** Gemini, Google, and Fish.audio are mocked in tests.
