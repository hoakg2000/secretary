# Plan — chat storage (task 6.4, D19, D20)

Written 2026-10-13. Implements the latest change-log row of `documents/db.md`:

> Added section 5 "Chat" `[Planned]`: tables `chat_sessions` and `chat_messages`, enum `ChatRole`, column
> `characters.memory_rule` (D19, D20). Chat is stored in full in relational tables and never in the vector store;
> `chat_messages.memory_id` is the only link from a chat message to `ai_memories`.

Nothing in this plan is built yet. Branch `refactor/plan-phase-0-3`. One commit, message ending `(plan 6.4)`.

## 1. Documents to read

Read in this order. Stop when the step you are on is covered.

| # | Document | Read it for | Needed by step |
|---|----------|-------------|----------------|
| 1 | `documents/db.md` — change log, section 1 `characters`, section 4 `ai_memories`, section 5 "Chat", "Indexes that exist only in migrations" | The exact columns, types, `onDelete` rules, indexes, migration name, and the three indexes Prisma will try to drop. **Source of truth for the schema.** | 3.1, 3.2 |
| 2 | `documents/next-steps.md` section 0 (working rules, migration workflow, CRLF, test style), section 2.2 (D20-a, D20-b), section 6.4 (full design), section 1.4 (deferred checks for 6.4) | Route behaviour, what is stored when, tests to write, commit gate. **The file is deleted in the working tree but not committed as deleted: read it with `git show HEAD:documents/next-steps.md`.** | all |
| 3 | `documents/modules/ai/ai.service.md` — "After task 6.4 `[Planned]`" table (steps a–g), "ChatSessionService `[Planned]`", `saveMemory` | Method list of the new service and where each call sits in the turn. | 3.4, 3.5 |
| 4 | `documents/modules/ai/ai.controller.md` — endpoint 1 "Request `[Planned]`", "What the endpoint does", frames table, endpoints 8–10 | Request and response shape of the changed route and the three new routes. | 3.6 |
| 5 | `documents/api.md` — "AI agent", "Chat storage — Planned" | The public contract to make true, and the text to rewrite afterwards. | 3.6, 3.9 |
| 6 | `documents/decisions.md` — rows D8, D19, D20 | Why; D8 is superseded. Only if a design question comes up. | — |
| 7 | `documents/modules/character/character.controller.md`, `character.service.md` | Only to update them for `memoryRule` (step 3.9). | 3.9 |
| 8 | `documents/modules/ai/ai-flow.mermaid.live`, `documents/summary.md` section C | Only to update them (step 3.9): dashed `Planned` edges become solid. | 3.9 |

Not needed: `environment.md`, `setup.md`, the email / finance / calendar / auth module documents, `templates/`.
No environment variable changes.

## 2. Scope

Every place the change reaches:

| File | Change |
|------|--------|
| `server/prisma/schema.prisma` | Enum `ChatRole`, models `ChatSession`, `ChatMessage`, field `Character.memoryRule`, three back-relations. |
| `server/prisma/migrations/<timestamp>_chat_sessions_messages/migration.sql` | New. |
| `server/src/ai-agent/services/chat/chat-session.service.ts` | New. |
| `server/src/ai-agent/services/chat/chat-session.service.spec.ts` | New. |
| `server/src/ai-agent/ai-agent.module.ts` | Register `ChatSessionService` in `providers`. |
| `server/src/ai-agent/dto/chat-stream.dto.ts` | Add `sessionId`, delete `history` and `ChatHistoryTurnDto`. |
| `server/src/ai-agent/dto/list-chat.dto.ts` | New: `page`, `pageSize` (same rules as `ListMemoryDto`). |
| `server/src/ai-agent/services/agent/agent.service.ts` | `chatStream(userId, dto)`, stored history, turn context, importance rule, memory link. |
| `server/src/ai-agent/services/agent/agent.service.spec.ts` | `build()` gets a `ChatSessionService` stub; new cases. |
| `server/src/ai-agent/ai-agent.controller.ts` | `chatStream` reads `req.user.userId`; three session routes. |
| `server/src/ai-agent/ai-agent.controller.spec.ts` | Provide `ChatSessionService`; drop the `history` assertions. |
| `server/src/character/dto/create-character.dto.ts` | Optional `memoryRule`. `UpdateCharacterDto` inherits it; `CharacterService` passes the DTO through, no change. |
| Documents | Step 3.9. |

Unchanged on purpose: `MemoryService`, `memory.tools.ts` (the tool keeps its one-argument contract),
`memory.queries.ts`, `RagChunkService` (D7), `ai_memories` columns, `prisma/seed.ts`, `server/.env.example`.

Not built (not requested): session rename, message edit or delete, a model-generated title, any embedding or
search over chat tables, a summary job, rewriting a stored message after confirm / discard.

## 3. Steps

### 3.1 `schema.prisma`

In section 1, model `Character`: add

```prisma
memoryRule String? @map("memory_rule") @db.Text // D20: importance rule; null = built-in default
```

and back-relation `chatSessions ChatSession[]`. Model `User`: add `chatSessions ChatSession[]`.
Model `AiMemory`: add `chatMessage ChatMessage?` (one-to-one, because `memory_id` is unique).

New section 5 at the end of the file:

```prisma
// ==========================================
// 5. CHAT SESSIONS & MESSAGES (D19, D20)
// ==========================================
// Relational only: no vector / tsvector column here, ever (D19).

model ChatSession {
  id            String    @id @default(uuid())
  userId        String    @map("user_id")
  characterId   String?   @map("character_id")
  title         String?
  lastMessageAt DateTime  @default(now()) @map("last_message_at")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  user      User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  character Character?    @relation(fields: [characterId], references: [id], onDelete: SetNull)
  messages  ChatMessage[]

  @@index([userId, lastMessageAt])
  @@map("chat_sessions")
}

enum ChatRole {
  USER
  MODEL
}

model ChatMessage {
  id        String   @id @default(uuid())
  sessionId String   @map("session_id")
  role      ChatRole
  content   String   @db.Text
  toolCalls Json?    @map("tool_calls")
  memoryId  String?  @unique @map("memory_id")
  createdAt DateTime @default(now()) @map("created_at")

  session ChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  memory  AiMemory?   @relation(fields: [memoryId], references: [id], onDelete: SetNull)

  @@index([sessionId, createdAt])
  @@map("chat_messages")
}
```

### 3.2 Migration `chat_sessions_messages`

Run from `server/`. The `secretary_postgres` container was up when this plan was written; if it is not, ask the
owner to start it, or hand-write the SQL below into a new folder and list it as unverified.

1. `npx prisma migrate dev --create-only --name chat_sessions_messages`
2. **Read the generated SQL.** Delete any `DROP INDEX` for `characters_single_active`,
   `ai_memories_embedding_hnsw`, `ai_memories_content_tsv_gin` (unknown to `schema.prisma`, see `db.md` last
   section). Also delete any statement that touches `ai_memories.embedding` or `content_tsv`.
3. The file must then contain only this (names as Prisma generates them):

```sql
-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('USER', 'MODEL');

-- AlterTable
ALTER TABLE "characters" ADD COLUMN "memory_rule" TEXT;

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "character_id" TEXT,
    "title" TEXT,
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "tool_calls" JSONB,
    "memory_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_sessions_user_id_last_message_at_idx" ON "chat_sessions"("user_id", "last_message_at");

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_memory_id_key" ON "chat_messages"("memory_id");

-- CreateIndex
CREATE INDEX "chat_messages_session_id_created_at_idx" ON "chat_messages"("session_id", "created_at");

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_memory_id_fkey" FOREIGN KEY ("memory_id") REFERENCES "ai_memories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

4. `npx prisma migrate dev` (applies), then `npx prisma generate`.
5. Check: `\d chat_sessions`, `\d chat_messages` show no `vector` / `tsvector` column; the three hand-written
   indexes still exist (`\di characters_single_active ai_memories_*`).

The migration only adds objects. No existing row is changed and nothing is dropped.

### 3.3 DTOs

`chat-stream.dto.ts`: delete `ChatHistoryTurnDto` and `history` with their now-unused imports. Add

```ts
@ApiPropertyOptional({ description: 'ID phiên chat cần tiếp tục (không truyền thì server tạo phiên mới)' })
@IsUUID()
@IsOptional()
sessionId?: string;
```

`list-chat.dto.ts`: `page` (int ≥ 1) and `pageSize` (int 1–50), copied from `ListMemoryDto` lines 16–29.

`create-character.dto.ts`: optional `memoryRule` — `@IsString() @MaxLength(2000) @IsOptional()`. The limit is
there because the text is placed in the system prompt of every turn.

### 3.4 `ChatSessionService` (new, `PrismaService` only)

Methods as in `ai.service.md` "ChatSessionService":

| Method | Notes |
|--------|-------|
| `resolve(userId, sessionId, characterId, firstMessage)` | No `sessionId`: create with `title = firstMessage.slice(0, 80)`. With `sessionId`: `findFirst({ where: { id, userId } })`; not found → `NotFoundException` (same answer for "does not exist" and "not yours"). |
| `appendMessage(sessionId, role, content, toolCalls?)` | One `$transaction`: insert the message, set `lastMessageAt` to now. Returns the message. |
| `recentHistory(sessionId, beforeMessageId, limit = 20)` | Newest `limit` rows before the given message, returned oldest first as `{ role: 'user' \| 'model', parts: [{ text }] }`. Skip rows with empty `content` and drop leading `model` rows, so the list starts with a user turn. |
| `linkMemory(messageId, memoryId)` | `update` of `memoryId`. |
| `listSessions(userId, page, pageSize)` | `orderBy: { lastMessageAt: 'desc' }`; return shape as `MemoryService.listMemories`. |
| `listMessages(userId, sessionId, page, pageSize)` | Ownership check first, then `orderBy: { createdAt: 'asc' }`. |
| `deleteSession(userId, sessionId)` | `deleteMany({ where: { id, userId } })`; count 0 → `NotFoundException`. |

Register it in `ai-agent.module.ts` `providers` (no export needed).

### 3.5 `AgentService`

Current code: `server/src/ai-agent/services/agent/agent.service.ts`.

1. Constructor: inject `ChatSessionService`.
2. `getPersonaPrompt` (line 124) and `buildSystemInstruction` (line 149): load the character once and return it
   with the prompt, so `memoryRule` and the character ID are available without a second query. Add one section
   to the system instruction: `character?.memoryRule ?? DEFAULT_MEMORY_RULE`, followed by the sentence "call
   `save_user_memory` only for a message that meets this rule; never for anything else". `DEFAULT_MEMORY_RULE`
   is an exported constant (long-lived facts about the owner: identity, preferences, relationships,
   commitments).
3. `chatStream(userId: string, dto)` (line 192) becomes `async` and returns `Promise<Observable<…>>`. Before the
   `Observable` is created: `resolve` the session, so a foreign or unknown `sessionId` throws
   `NotFoundException` as an HTTP 404 and the model is never called. The stored `characterId` of a new session is
   `dto.characterId` if that character exists, else the active character's ID, else null. For the persona of a
   turn use `dto.characterId ?? session.characterId`, then the active character.
4. Inside the `Observable`, in this order: emit `{ type: 'session', sessionId }`; `appendMessage(USER,
   dto.message)`; `recentHistory(sessionId, userMessage.id)`; run the turn.
5. `runChat` (line 216): replace `history: dto.history?.map(...)` (lines 234–237) by the stored history. Pass a
   turn context `{ userMessageId, text: '', toolCalls: [], memoryLinked: false }`. Append every emitted `text`
   chunk to `turn.text` (line 254).
6. `executeToolCall` (line 285): push one entry per call to `turn.toolCalls` — `{ tool, args, result }`,
   `{ tool, args, error }`, or `{ tool, args, actionId }` for a pending confirmation. After a successful
   `save_user_memory` run, if `!turn.memoryLinked` and `result.id` is set, call
   `linkMemory(turn.userMessageId, result.id)` and set the flag. The message ID never comes from the model.
   `memory_id` is unique and one message holds one link, so only the first save of a turn is linked; a second
   save in the same turn still creates a memory, unlinked.
7. End of turn: store the `MODEL` row with `turn.text` and `turn.toolCalls` (null when empty) only when
   `runChat` resolved **and** the client has not cancelled, then emit `done`. On `error` or cancel: no `MODEL`
   row. `confirmAction` / `discardAction` are not changed.

### 3.6 Controller

`ai-agent.controller.ts`:

- `chatStream` (line 109): `async chatStream(@Req() req: Request & { user: { userId: string } }, @Body() dto)`
  → `this.agentService.chatStream(req.user.userId, dto)`. The field is `userId` (see `auth.controller.ts` line
  123), not `id` as `next-steps.md` writes. Add `session` to the frame list in the `@ApiOperation` description.
- Inject `ChatSessionService`. Add, with the same envelope as the memory routes:
  `GET sessions` (`@Query() ListChatDto`), `GET sessions/:id/messages`, `DELETE sessions/:id`.

### 3.7 Tests

Style: direct construction with hand-written mocks (`agent.service.spec.ts` `build()`, line 16). Add a
`ChatSessionService` stub to `build()` and pass a user ID in `run()`.

`agent.service.spec.ts`, new cases:

1. No `sessionId` → `resolve` creates one session; first frame is `session`.
2. With `sessionId` → the stored first turn reaches `chats.create` as `history`.
3. `resolve` rejects with `NotFoundException` → `chatStream` rejects, `sendMessageStream` not called.
4. Turn without a tool call → `appendMessage` called twice (USER, MODEL with the joined text); `linkMemory` not called.
5. Model calls `save_user_memory` → `linkMemory(userMessageId, memory.id)` called once; a second call in the same turn does not link.
6. `error` turn (tool-round limit) → no `MODEL` row.
7. `confirmation_required` turn → the `MODEL` row's `toolCalls` holds the `actionId`.
8. `memoryRule` of the character is in the system instruction; `DEFAULT_MEMORY_RULE` when it is null.

`chat-session.service.spec.ts`: `resolve` with another user's session throws; `recentHistory` returns oldest
first, skips empty content and a leading `model` row; `deleteSession` of a foreign session throws.

`ai-agent.controller.spec.ts`: provide `ChatSessionService`; stub `req.user` (the spec has no guard); replace
the `history` cases by "`sessionId` that is not a UUID → 400" and "a rejected `chatStream` → HTTP 404".

### 3.8 Gate

From `server/`: `npx tsc --noEmit`, `npm test`, `npx nest build`. Source files are CRLF: edit with an editor,
not with multi-line `sed`.

### 3.9 Documents (same commit)

| Document | Change |
|----------|--------|
| `db.md` | New change-log row; remove `[Planned]` from section 5, from the table header and from `characters.memory_rule`; replace "Not in `schema.prisma` yet…" by the migration folder name; note D20-a settled as a column. |
| `api.md` | Change-log row; move the "Chat storage — Planned" rows into the main table; body `{ message, sessionId?, characterId? }`; add the `session` frame; delete "Today the server stores no chat…"; add `memoryRule` to the character body. |
| `modules/ai/ai.controller.md`, `ai.service.md` | `[Planned]` → `[Implemented]`; remove the "Today" request with `history`; signature `chatStream(userId, dto)`; the first-save-only link rule. |
| `modules/ai/ai-flow.mermaid.live` | Dashed chat-storage edges become solid. |
| `modules/character/character.controller.md`, `character.service.md` | `memoryRule` field. |
| `summary.md` section C | `[Planned]` → built. |
| `decisions.md` | D8 note "still what the code does" removed; D20 status: both open details settled by the proposed defaults (see section 4). |
| `next-steps.md` | Deleted in the working tree. If it is restored: mark 6.4 done, close 2.2. If the deletion is intended: remove the references to it from the documents above. |

## 4. Open points

| # | Point | This plan assumes |
|---|-------|-------------------|
| D20-a | Where the importance rule is stored. | Column `characters.memory_rule`, as `db.md` already records. |
| D20-b | What text is embedded. | The sentence the AI passes to `save_user_memory` (today's behaviour); the full message stays in `chat_messages` and is linked by `memory_id`. No code change needed for this default. |
| 1 | Whether Nest accepts an `async` `@Sse` handler (a `Promise<Observable>`), so a bad `sessionId` is a real HTTP 404. | It does. The controller spec case "rejected `chatStream` → 404" proves it. If it fails, the 404 becomes an `error` frame and `api.md` must say so. |
| 2 | Wording of `DEFAULT_MEMORY_RULE`. | A first draft in Vietnamese, like the other prompt text; the owner adjusts it later. |
| 3 | `next-steps.md`, `plan.md`, `report.md` are deleted in the working tree, uncommitted. | Not touched by this task. The owner decides before the documents commit. |

## 5. Checks that need real services (not part of the gate)

From `next-steps.md` section 1.4:

- `npx prisma migrate deploy` applies `chat_sessions_messages` on a clean database.
- Chat "Tên tôi là Hoa", then a request with only the returned `sessionId` asking "Tên tôi là gì?" → the answer
  has the name; one row in `chat_sessions`, four in `chat_messages`.
- One small-talk message and one message the rule calls important → `ai_memories` gains exactly one row; only
  that message has `memory_id`.
