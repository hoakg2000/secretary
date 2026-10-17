# Graph Report - server  (2026-10-17)

## Corpus Check
- 138 files · ~56,829 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 2, .example 1, .toml 1)

## Summary
- 1074 nodes · 2482 edges · 46 communities (35 shown, 11 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 104 edges (avg confidence: 0.85)
- Token cost: 0 input · 52,820 output

## Community Hubs (Navigation)
- Google Clients & Test Harness
- Finance DTOs & Ledger
- Email Ingestion API
- Google OAuth & Calendar Sync
- Auth Controller & Sessions
- Calendar API
- Proactive Notifications
- Character API
- Nest Module Wiring
- Server Docs & Local Infra
- Package Metadata
- Runtime Dependencies
- Agent Service & Gemini
- AI Agent Controller
- AI DTOs & Chat Sessions
- Dev Dependencies
- Chat Stream & Prompt Build
- TypeScript Config
- Calendar DTOs & AI Tools
- Memory Search DTO
- npm Scripts
- Email Rules
- TTS & Chat Session Service
- Email AI & Worker
- Memory Save & RAG Chunks
- Auth Module & JWT Guard
- Finance DTO Files
- Tool Calling & Confirmation
- Database Seed Entry
- Character Seed Loader
- Root App Controller
- Create Transaction DTO
- Env Validation Rules
- Pub/Sub Push DTOs
- Validation Library Users
- Bank Account DTO
- Category DTO
- List Memory DTO
- Build TS Config
- Prisma TS Config
- Nest CLI Config
- Lint Config
- App Bootstrap
- List Chat DTO
- AI Transaction DTO
- Node Engine Pin

## God Nodes (most connected - your core abstractions)
1. `@nestjs/common` - 59 edges
2. `PrismaService` - 41 edges
3. `@nestjs/swagger` - 39 edges
4. `@prisma/client` - 34 edges
5. `class-validator` - 32 edges
6. `FinanceService` - 30 edges
7. `FinanceController` - 23 edges
8. `compilerOptions` - 21 edges
9. `AiAgentController` - 20 edges
10. `MemoryService` - 20 edges

## Surprising Connections (you probably didn't know these)
- `resetState()` --shares_data_with--> `postgres (pgvector/pgvector:pg16)`  [INFERRED]
  test/integration/harness.ts → docker-compose.yml
- `resetState()` --shares_data_with--> `redis (redis:7-alpine)`  [INFERRED]
  test/integration/harness.ts → docker-compose.yml
- `Real DB/Queue, Fake Third Parties at Client Boundary` --references--> `createTestModule()`  [EXTRACTED]
  CLAUDE.md → test/integration/harness.ts
- `Real DB/Queue, Fake Third Parties at Client Boundary` --references--> `resetState()`  [EXTRACTED]
  CLAUDE.md → test/integration/harness.ts
- `Email Rules and Ingestion` --references--> `redis (redis:7-alpine)`  [INFERRED]
  README.md → docker-compose.yml

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Server Pre-Commit Check Gate** — claude_type_check, claude_oxlint_lint, claude_integration_tests, claude_pre_commit_gate [EXTRACTED 1.00]
- **Integration Test Infrastructure** — test_integration_harness, vitest_config_int, docker_compose_postgres, docker_compose_redis [INFERRED 0.85]
- **Server Local Setup Flow** — docker_compose_postgres, docker_compose_redis, readme_prisma_migrate_deploy, readme_seed_script, readme_secretary_server [EXTRACTED 1.00]

## Communities (46 total, 11 thin omitted)

### Community 0 - "Google Clients & Test Harness"
Cohesion: 0.05
Nodes (51): bullmq, @nestjs/schedule, GoogleTokens, decryptToken(), encryptToken(), toKey(), BASE, b64() (+43 more)

### Community 1 - "Finance DTOs & Ledger"
Cohesion: 0.06
Nodes (5): AdjustBalanceDto, FilterTransactionDto, SummaryQueryDto, FinanceController, FinanceService

### Community 2 - "Email Ingestion API"
Cohesion: 0.06
Nodes (7): EmailWebhookDto, ListEmailLogDto, EmailController, ProcessEmailJobData, EmailRuleService, EmailService, JOB_PRIORITY

### Community 3 - "Google OAuth & Calendar Sync"
Cohesion: 0.06
Nodes (16): cron, googleapis, GoogleClientFactory, JwtStrategy, CalendarSyncResult, CalendarSyncService, DirtyState, isGone() (+8 more)

### Community 4 - "Auth Controller & Sessions"
Cohesion: 0.08
Nodes (6): @nestjs/throttler, AuthController, AuthService, LoginDto, LogoutDto, RefreshTokenDto

### Community 5 - "Calendar API"
Cohesion: 0.08
Nodes (5): CalendarController, CalendarService, CalendarTools, AiDeleteEventDto, QueryCalendarDto

### Community 6 - "Proactive Notifications"
Cohesion: 0.07
Nodes (14): AiTool(), ProactiveChannel, TELEGRAM, ProactiveTriggerType, CUSTOM, INACTIVITY_FALLBACK, SCHEDULED_REMINDER, URGENT_EVENT (+6 more)

### Community 7 - "Character API"
Cohesion: 0.10
Nodes (4): CharacterController, CharacterService, CreateCharacterDto, UpdateCharacterDto

### Community 8 - "Nest Module Wiring"
Cohesion: 0.12
Nodes (12): @nestjs/bullmq, @nestjs/common, @nestjs/core, AiAgentModule, AuthModule, CalendarModule, CharacterModule, PrismaExceptionFilter (+4 more)

### Community 9 - "Server Docs & Local Infra"
Cohesion: 0.07
Nodes (29): Full Suite (npm run test:int), Integration Tests (vitest int-spec), Lint (npx oxlint src/ test/), server/ Working Rules, Changed Path to Spec Mapping Table, Type Check (npx tsc --noEmit), postgres (pgvector/pgvector:pg16), postgres_data volume (+21 more)

### Community 10 - "Package Metadata"
Cohesion: 0.06
Nodes (31): author, description, license, name, private, version, @langchain/textsplitters, @nestjs/cli (+23 more)

### Community 11 - "Runtime Dependencies"
Cohesion: 0.06
Nodes (31): dependencies, bcrypt, bullmq, class-transformer, class-validator, cookie-parser, cron, dotenv (+23 more)

### Community 12 - "Agent Service & Gemini"
Cohesion: 0.09
Nodes (19): @google/genai, rxjs, GenAiProvider, CHAT_MODEL, ChatFrame, ChatTurn, DEFAULT_MEMORY_RULE, DiscoveredTool (+11 more)

### Community 14 - "AI DTOs & Chat Sessions"
Cohesion: 0.17
Nodes (6): UpdateMemoryDto, ChatHistoryTurn, EmbeddingTaskType, MemorySearchResult, MemoryService, MemoryTools

### Community 15 - "Dev Dependencies"
Cohesion: 0.09
Nodes (23): devDependencies, @nestjs/cli, @nestjs/mau, @nestjs/schematics, @nestjs/testing, oxlint, prettier, prisma (+15 more)

### Community 16 - "Chat Stream & Prompt Build"
Cohesion: 0.10
Nodes (5): ChatStreamDto, joinRounds(), ReplyStreamParser, SIMPLE_ESCAPES, buildCharacterPrompt()

### Community 17 - "TypeScript Config"
Cohesion: 0.09
Nodes (21): compilerOptions, allowSyntheticDefaultImports, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, incremental, isolatedModules (+13 more)

### Community 18 - "Calendar DTOs & AI Tools"
Cohesion: 0.18
Nodes (3): AiUpdateEventDto, CreateEventDto, UpdateEventDto

### Community 19 - "Memory Search DTO"
Cohesion: 0.11
Nodes (3): SearchMemoryDto, HybridSearchParams, MemoryQueries

### Community 20 - "npm Scripts"
Cohesion: 0.11
Nodes (18): scripts, build, deploy, format, lint, migrate, postinstall, seed (+10 more)

### Community 21 - "Email Rules"
Cohesion: 0.20
Nodes (5): @prisma/client, CreateEmailRuleDto, UpdateEmailRuleDto, ClassifiableEmail, RULE_PRECEDENCE

### Community 22 - "TTS & Chat Session Service"
Cohesion: 0.14
Nodes (3): TtsRequestDto, ChatSessionService, TtsService

### Community 23 - "Email AI & Worker"
Cohesion: 0.20
Nodes (3): EmailAiService, EmailClassification, EmailProcessor

### Community 25 - "Auth Module & JWT Guard"
Cohesion: 0.21
Nodes (6): @nestjs/config, @nestjs/jwt, @nestjs/passport, JwtAuthGuard, JwtPayload, IS_PUBLIC_KEY

### Community 26 - "Finance DTO Files"
Cohesion: 0.41
Nodes (4): @nestjs/swagger, UpdateBankAccountDto, UpdateCategoryDto, UpdateTransactionDto

### Community 27 - "Tool Calling & Confirmation"
Cohesion: 0.19
Nodes (3): AgentService, toPlain(), PendingActionStore

### Community 28 - "Database Seed Entry"
Cohesion: 0.17
Nodes (7): seedCharacters(), main(), bcrypt, dotenv, ioredis, pg, @prisma/adapter-pg

### Community 29 - "Character Seed Loader"
Cohesion: 0.22
Nodes (9): bullets(), DEFAULT_DIR, Dict, label(), LIST_FIELDS, loadCharacterFile(), optionalString(), renderCharacterPrompt() (+1 more)

### Community 30 - "Root App Controller"
Cohesion: 0.24
Nodes (3): AppController, AppService, Public()

### Community 34 - "Validation Library Users"
Cohesion: 0.38
Nodes (3): class-transformer, class-validator, validate()

### Community 38 - "Build TS Config"
Cohesion: 0.25
Nodes (7): ./tsconfig.json, compilerOptions, moduleResolution, rootDir, exclude, extends, include

### Community 39 - "Prisma TS Config"
Cohesion: 0.25
Nodes (7): compilerOptions, esModuleInterop, module, moduleResolution, skipLibCheck, target, include

### Community 40 - "Nest CLI Config"
Cohesion: 0.29
Nodes (6): collection, compilerOptions, deleteOutDir, plugins, $schema, sourceRoot

### Community 41 - "Lint Config"
Cohesion: 0.29
Nodes (6): env, node, rules, @typescript-eslint/no-explicit-any, @typescript-eslint/no-floating-promises, $schema

### Community 42 - "App Bootstrap"
Cohesion: 0.29
Nodes (4): cookie-parser, helmet, @nestjs/platform-express, AppModule

## Knowledge Gaps
- **42 isolated node(s):** `passport`, `reflect-metadata`, `swagger-ui-express`, `@nestjs/cli`, `@nestjs/mau` (+37 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 465 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@nestjs/common` connect `Nest Module Wiring` to `Google Clients & Test Harness`, `Validation Library Users`, `Google OAuth & Calendar Sync`, `Auth Controller & Sessions`, `Email Ingestion API`, `Proactive Notifications`, `Character API`, `Package Metadata`, `App Bootstrap`, `Agent Service & Gemini`, `AI DTOs & Chat Sessions`, `Calendar DTOs & AI Tools`, `Email Rules`, `Auth Module & JWT Guard`, `Finance DTO Files`, `Root App Controller`?**
  _High betweenness centrality (0.241) - this node is a cross-community bridge._
- **What connects `passport`, `reflect-metadata`, `swagger-ui-express` to the rest of the system?**
  _42 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Google Clients & Test Harness` be split into smaller, more focused modules?**
  _Cohesion score 0.050669772859638904 - nodes in this community are weakly interconnected._
- **Why does `@nestjs/swagger` connect `Finance DTO Files` to `Validation Library Users`, `Email Ingestion API`, `Auth Controller & Sessions`, `Proactive Notifications`, `Character API`, `Package Metadata`, `App Bootstrap`, `AI DTOs & Chat Sessions`, `Chat Stream & Prompt Build`, `Calendar DTOs & AI Tools`, `Email Rules`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **Should `Finance DTOs & Ledger` be split into smaller, more focused modules?**
  _Cohesion score 0.06385964912280702 - nodes in this community are weakly interconnected._
- **Why does `@prisma/client` connect `Email Rules` to `Google Clients & Test Harness`, `Validation Library Users`, `Google OAuth & Calendar Sync`, `Email Ingestion API`, `Nest Module Wiring`, `Package Metadata`, `Agent Service & Gemini`, `AI DTOs & Chat Sessions`, `Chat Stream & Prompt Build`, `Calendar DTOs & AI Tools`, `Memory Search DTO`, `Auth Module & JWT Guard`, `Finance DTO Files`, `Database Seed Entry`, `Character Seed Loader`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Should `Email Ingestion API` be split into smaller, more focused modules?**
  _Cohesion score 0.05913461538461538 - nodes in this community are weakly interconnected._