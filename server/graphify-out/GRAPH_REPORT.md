# Graph Report - server  (2026-10-17)

## Corpus Check
- 134 files · ~54,054 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 2, .example 1, .toml 1)

## Summary
- 1052 nodes · 2455 edges · 35 communities (30 shown, 5 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 104 edges (avg confidence: 0.85)
- Token cost: 0 input · 63,818 output

## Community Hubs (Navigation)
- Shared Library Imports
- Integration Test Suite
- Finance Ledger API
- AI Agent Chat API
- Local Calendar
- Semantic Memory
- Email Rules & Ingestion
- Google Clients & Prisma
- Character & Personas
- Auth & Sessions
- Proactive Notifications
- Runtime Dependencies
- Core Dependency Set
- Nest Module Wiring
- Gemini & AI Tools
- Dev Dependencies
- Chat Sessions & TTS
- TypeScript Config
- npm Scripts
- Email Worker Pipeline
- App Bootstrap & Guards
- JWT & Config Wiring
- Server Docs & Rules
- Local Infra & Test Gate
- Env Validation
- Pub/Sub Push DTOs
- Root App Controller
- Test Runner Setup
- Build TS Config
- Prisma TS Config
- Nest CLI Config
- Lint Config
- Database Seed
- Prisma Error Filter
- Node Engine Pin

## God Nodes (most connected - your core abstractions)
1. `@nestjs/common` - 59 edges
2. `@nestjs/swagger` - 41 edges
3. `PrismaService` - 41 edges
4. `@prisma/client` - 34 edges
5. `class-validator` - 32 edges
6. `FinanceService` - 30 edges
7. `FinanceController` - 23 edges
8. `AiAgentController` - 20 edges
9. `MemoryService` - 20 edges
10. `createTestModule()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `resetState()` --shares_data_with--> `postgres service (pgvector/pgvector:pg16)`  [INFERRED]
  test/integration/harness.ts → docker-compose.yml
- `resetState()` --shares_data_with--> `redis service (redis:7-alpine)`  [INFERRED]
  test/integration/harness.ts → docker-compose.yml
- `Real DB/Queue, Fake Third Parties at Client Boundary` --references--> `createTestModule()`  [EXTRACTED]
  CLAUDE.md → test/integration/harness.ts
- `Real DB/Queue, Fake Third Parties at Client Boundary` --references--> `resetState()`  [EXTRACTED]
  CLAUDE.md → test/integration/harness.ts
- `Secretary Server (NestJS API)` --references--> `Full Suite (npm run test:int)`  [EXTRACTED]
  README.md → CLAUDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Server Pre-Commit Check Gate** — claude_type_check, claude_oxlint_lint, claude_integration_tests, claude_pre_commit_gate [EXTRACTED 1.00]
- **Integration Test Infrastructure** — test_integration_harness, vitest_config_int, docker_compose_postgres, docker_compose_redis [INFERRED 0.85]
- **Secretary Server Feature Modules** — readme_ai_agent, readme_finance_ledger, readme_email_rules_ingestion, readme_local_calendar_google_push, readme_proactive_reminders [EXTRACTED 1.00]

## Communities (35 total, 5 thin omitted)

### Community 0 - "Shared Library Imports"
Cohesion: 0.05
Nodes (19): bullmq, class-transformer, class-validator, @nestjs/bullmq, @nestjs/swagger, @prisma/client, CreateEmailRuleDto, UpdateEmailRuleDto (+11 more)

### Community 1 - "Integration Test Suite"
Cohesion: 0.07
Nodes (40): BASE, b64(), message(), MessageSpec, assertTestPrefix(), createTestModule(), EMAIL_QUEUE, overrideConfig() (+32 more)

### Community 2 - "Finance Ledger API"
Cohesion: 0.06
Nodes (5): AdjustBalanceDto, FilterTransactionDto, SummaryQueryDto, FinanceController, FinanceService

### Community 3 - "AI Agent Chat API"
Cohesion: 0.06
Nodes (6): AiAgentController, ListChatDto, AgentService, toPlain(), ChatSessionService, TtsService

### Community 4 - "Local Calendar"
Cohesion: 0.07
Nodes (8): CalendarController, CalendarService, CalendarTools, AiDeleteEventDto, AiUpdateEventDto, CreateEventDto, QueryCalendarDto, UpdateEventDto

### Community 5 - "Semantic Memory"
Cohesion: 0.05
Nodes (12): ListMemoryDto, SaveMemoryDto, SearchMemoryDto, UpdateMemoryDto, HybridSearchParams, MemoryQueries, EmbeddingTaskType, MemorySearchResult (+4 more)

### Community 6 - "Email Rules & Ingestion"
Cohesion: 0.06
Nodes (5): EmailWebhookDto, ListEmailLogDto, EmailController, EmailRuleService, EmailService

### Community 7 - "Google Clients & Prisma"
Cohesion: 0.06
Nodes (20): cron, googleapis, @nestjs/jwt, GoogleClientFactory, GoogleTokens, CalendarSyncResult, CalendarSyncService, DirtyState (+12 more)

### Community 8 - "Character & Personas"
Cohesion: 0.08
Nodes (6): CharacterController, CharacterService, CreateCharacterDto, CreatePersonaDto, UpdateCharacterDto, UpdatePersonaDto

### Community 9 - "Auth & Sessions"
Cohesion: 0.08
Nodes (8): @nestjs/throttler, AuthController, AuthService, LoginDto, LogoutDto, RefreshTokenDto, Public(), PublicController

### Community 10 - "Proactive Notifications"
Cohesion: 0.07
Nodes (13): ProactiveChannel, TELEGRAM, ProactiveTriggerType, CUSTOM, INACTIVITY_FALLBACK, SCHEDULED_REMINDER, URGENT_EVENT, TriggerProactiveDto (+5 more)

### Community 11 - "Runtime Dependencies"
Cohesion: 0.06
Nodes (34): author, description, license, name, private, version, cookie-parser, helmet (+26 more)

### Community 12 - "Core Dependency Set"
Cohesion: 0.06
Nodes (31): dependencies, bcrypt, bullmq, class-transformer, class-validator, cookie-parser, cron, dotenv (+23 more)

### Community 13 - "Nest Module Wiring"
Cohesion: 0.15
Nodes (9): AiAgentModule, AuthModule, CalendarModule, CharacterModule, validate(), EmailModule, FinanceModule, PrismaModule (+1 more)

### Community 14 - "Gemini & AI Tools"
Cohesion: 0.12
Nodes (17): @google/genai, GenAiProvider, CHAT_MODEL, ChatCharacter, ChatFrame, ChatTurn, DEFAULT_MEMORY_RULE, DiscoveredTool (+9 more)

### Community 15 - "Dev Dependencies"
Cohesion: 0.09
Nodes (23): devDependencies, @nestjs/cli, @nestjs/mau, @nestjs/schematics, @nestjs/testing, oxlint, prettier, prisma (+15 more)

### Community 16 - "Chat Sessions & TTS"
Cohesion: 0.14
Nodes (4): rxjs, ChatStreamDto, TtsRequestDto, ChatHistoryTurn

### Community 17 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowSyntheticDefaultImports, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, incremental, isolatedModules (+11 more)

### Community 18 - "npm Scripts"
Cohesion: 0.11
Nodes (18): scripts, build, deploy, format, lint, migrate, postinstall, seed (+10 more)

### Community 19 - "Email Worker Pipeline"
Cohesion: 0.17
Nodes (3): EmailAiService, EmailClassification, EmailProcessor

### Community 20 - "App Bootstrap & Guards"
Cohesion: 0.18
Nodes (7): @nestjs/common, @nestjs/core, @nestjs/schedule, PendingAction, PendingActionStore, AppModule, IS_PUBLIC_KEY

### Community 21 - "JWT & Config Wiring"
Cohesion: 0.18
Nodes (5): @nestjs/config, @nestjs/passport, JwtAuthGuard, JwtPayload, JwtStrategy

### Community 22 - "Server Docs & Rules"
Cohesion: 0.15
Nodes (11): Lint (npx oxlint src/ test/), server/ Working Rules, Type Check (npx tsc --noEmit), documents/api.md, Email Rules and Ingestion, documents/environment.md, Finance Ledger, Local Calendar with One-Way Google Push (+3 more)

### Community 23 - "Local Infra & Test Gate"
Cohesion: 0.21
Nodes (11): Full Suite (npm run test:int), Integration Tests (vitest int-spec), Changed Path to Spec Mapping Table, postgres service (pgvector/pgvector:pg16), postgres_data volume, redis service (redis:7-alpine), redis_data volume, prisma/schema.prisma (+3 more)

### Community 27 - "Test Runner Setup"
Cohesion: 0.25
Nodes (4): ioredis, pg, vite-tsconfig-paths, vitest

### Community 28 - "Build TS Config"
Cohesion: 0.25
Nodes (7): ./tsconfig.json, compilerOptions, moduleResolution, rootDir, exclude, extends, include

### Community 29 - "Prisma TS Config"
Cohesion: 0.25
Nodes (7): compilerOptions, esModuleInterop, module, moduleResolution, skipLibCheck, target, include

### Community 30 - "Nest CLI Config"
Cohesion: 0.29
Nodes (6): collection, compilerOptions, deleteOutDir, plugins, $schema, sourceRoot

### Community 31 - "Lint Config"
Cohesion: 0.29
Nodes (6): env, node, rules, @typescript-eslint/no-explicit-any, @typescript-eslint/no-floating-promises, $schema

### Community 32 - "Database Seed"
Cohesion: 0.29
Nodes (3): bcrypt, dotenv, @prisma/adapter-pg

## Knowledge Gaps
- **37 isolated node(s):** `passport`, `reflect-metadata`, `swagger-ui-express`, `@nestjs/cli`, `@nestjs/mau` (+32 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 451 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@nestjs/common` connect `App Bootstrap & Guards` to `Shared Library Imports`, `Integration Test Suite`, `Local Calendar`, `Semantic Memory`, `Google Clients & Prisma`, `Character & Personas`, `Auth & Sessions`, `Proactive Notifications`, `Runtime Dependencies`, `Nest Module Wiring`, `Gemini & AI Tools`, `Chat Sessions & TTS`, `JWT & Config Wiring`, `Root App Controller`?**
  _High betweenness centrality (0.220) - this node is a cross-community bridge._
- **What connects `passport`, `reflect-metadata`, `swagger-ui-express` to the rest of the system?**
  _37 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Shared Library Imports` be split into smaller, more focused modules?**
  _Cohesion score 0.05182072829131653 - nodes in this community are weakly interconnected._
- **Why does `@nestjs/swagger` connect `Shared Library Imports` to `Local Calendar`, `Semantic Memory`, `Character & Personas`, `Auth & Sessions`, `Proactive Notifications`, `Runtime Dependencies`, `Chat Sessions & TTS`, `App Bootstrap & Guards`?**
  _High betweenness centrality (0.093) - this node is a cross-community bridge._
- **Should `Integration Test Suite` be split into smaller, more focused modules?**
  _Cohesion score 0.06550632911392405 - nodes in this community are weakly interconnected._
- **Why does `dependencies` connect `Core Dependency Set` to `Runtime Dependencies`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Should `Finance Ledger API` be split into smaller, more focused modules?**
  _Cohesion score 0.06385964912280702 - nodes in this community are weakly interconnected._