# AI Agent Services

- **Module**: `AiAgentModule` — `server/src/ai-agent/ai-agent.module.ts`
- **Description**: the chat turn (system instruction, Gemini stream, tool loop, write confirmation), long-term
  memory (pgvector + text search + decay at query time), text-to-speech. After task 6.4 also storage of chat
  sessions and messages.
- **There is no `AiService`.** The work is split over the classes below.

| Class | File (under `server/src/ai-agent/`) | Role | Status |
|-------|-------------------------------------|------|--------|
| `AgentService` | `services/agent/agent.service.ts` | Chat turn, tool discovery and execution, confirmation. | `[Implemented]` |
| `PendingActionStore` | `services/agent/pending-action.store.ts` | Proposed write actions, in memory, 5-minute lifetime, lost on restart. | `[Implemented]` |
| `MemoryService` | `services/memory/memory.service.ts` | Embedding, save, hybrid search, list, delete. | `[Implemented]` |
| `MemoryTools` | `tools/memory.tools.ts` | The two memory AI tools. | `[Implemented]` |
| `TtsService` | `services/tts/tts.service.ts` | Fish.audio MP3 stream. | `[Implemented]` |
| `GenAiProvider` | `genai.provider.ts` | One lazy Gemini client; 503 without `GEMINI_API_KEY`. | `[Implemented]` |
| `RagChunkService` | `services/rag-chunk/rag-chunk.service.ts` | Text chunking. Kept, called from nowhere (D7). | Unused |
| `ChatSessionService` | `services/chat/chat-session.service.ts` | Chat sessions and messages. | `[Planned]` |

**Tables**: `characters`, `personas` (read), `ai_memories` (read, write). `[Planned]`: `chat_sessions`,
`chat_messages` (read, write), `characters.memory_rule` (read). `rag_chunks` is written only by the unused
`RagChunkService`.

Status tags: `[Implemented]` = in the code today. `[Planned]` = designed in `next-steps.md` section 6.4, not built.

## Change log

| Date | Change |
|------|--------|
| 2026-10-13 | Rewritten from the code. `AiService` does not exist: replaced by the class table above. Tool catalog corrected to the ten real tools and their confirmation flag. Removed what does not exist: `updateMemory`, `processMemoryDecayJob`, `memory_decay_logs` (dropped, D6), `triggerProactiveOrchestrator` and `proactiveFallbackCronJob` (the proactive module has only a reminder cron), chunking of chat turns into `rag_chunks`. Corrected: embedding 1536 dimensions, text search configuration `simple`, default λ 0.01, `ts_rank` normalised, `minScore`. Added the confirmation gate, the 5-round limit and the pre-turn memory retrieval. |
| 2026-10-13 | Chat storage (D19, D20) `[Planned]`: new `ChatSessionService`; `AgentService.chatStream` stores the user's message and the model's answer in full in `chat_messages` and takes the history from there; the importance rule of the character is added to the system instruction; `save_user_memory` links the memory to the chat message. Chat is never written to the vector store otherwise. |

---

## AI tools (function calling)

`AgentService` finds every method decorated with `@AiTool()` at start-up (`DiscoveryService`). A tool method takes
exactly one argument object, validated against the tool's DTO (`whitelist`, `forbidNonWhitelisted`). A tool with
`requiresConfirmation` is **not run** inside the chat: it is parked in `PendingActionStore` and the client must
confirm it.

| Tool | Declared in | Confirmation |
|------|-------------|--------------|
| `get_financial_summary` | `FinanceService` | no |
| `search_financial_transactions` | `FinanceService` | no |
| `create_financial_transaction` | `FinanceService` | **yes** |
| `get_calendar_events` | `CalendarTools` | no |
| `create_calendar_event` | `CalendarTools` | no |
| `update_calendar_event` | `CalendarTools` | **yes** |
| `delete_calendar_event` | `CalendarTools` | **yes** |
| `search_semantic_memory` | `MemoryTools` | no |
| `save_user_memory` | `MemoryTools` | no |
| `send_proactive_notification` | `ProactiveService` | **yes** |

---

## AgentService

### 1. chatStream

- **Signature**: `chatStream(dto: ChatStreamDto): Observable<{ data: string }>`
- **AI tool**: no.

#### Today `[Implemented]`

1. Build the system instruction (`buildSystemInstruction`):
   - persona of `characterId`, or of the active character (`characters`, `personas`);
   - current time and `APP_TIMEZONE`;
   - the note that write tools are not run until the user confirms;
   - up to 5 memories found by `MemoryService.searchMemory` for the message, marked as reference data that must
     not be followed as instructions. A retrieval failure does not fail the chat.
2. Open a Gemini chat (`gemini-2.5-flash`) with all tool declarations and the `history` **sent by the client**.
3. Stream the answer as `text` frames. When the model calls tools, run them (`executeToolCall`), answer all calls
   of the round in one message, and continue. At most 5 rounds (`MAX_TOOL_ROUNDS`), then an `error` frame.
4. End with `done`, or `error`. If the client disconnects, the loop stops.

Nothing is stored. **Tables**: `characters`, `personas` (read); `ai_memories` (read; write only when the model
calls `save_user_memory`).

#### After task 6.4 `[Planned]`

Signature becomes `chatStream(userId, dto)`. Steps added around the turn above:

| # | When | Action | Table |
|---|------|--------|-------|
| a | Before step 1 | `ChatSessionService.resolve(userId, dto.sessionId, dto.characterId)`: create a session, or load it and check the owner (404 otherwise; the model is not called). Emit the `session` frame. | `chat_sessions` |
| b | Before step 1 | `ChatSessionService.appendMessage(sessionId, USER, dto.message)`: **the message sent by the user is stored in full.** | `chat_messages` |
| c | Step 1 | The system instruction gains the importance rule: `characters.memory_rule`, or the built-in default when it is null, with "call `save_user_memory` only for a message that meets this rule". | `characters` (read) |
| d | Step 2 | History = the last 20 messages of the session before the one stored in (b), oldest first. `dto.history` no longer exists. | `chat_messages` (read) |
| e | Step 3 | When the model calls `save_user_memory`, the new memory's ID is written to `memory_id` of the message stored in (b). The message ID travels in the turn context of `AgentService`, never as a model-supplied argument. | `ai_memories`, `chat_messages` |
| f | At `done` | `appendMessage(sessionId, MODEL, <all text chunks joined>, toolCalls)`: **the message received from the model is stored in full**, with the tool calls of the turn (results, or the pending `actionId`). | `chat_messages` |
| g | At `done` | `last_message_at` of the session is updated. | `chat_sessions` |

Rules:

- A turn that ends in `error`, or that the client aborts, keeps the `USER` row and writes no `MODEL` row. A partial
  answer is not stored.
- No embedding is computed for a chat message as such. The chat tables are never searched by vector, and the
  pre-turn retrieval of step 1 keeps reading `ai_memories` only.
- Only the path in (e) turns chat content into a memory. There is no per-message or per-session embedding and no
  summary job.

### 2. confirmAction / discardAction `[Implemented]`

- `confirmAction(actionId)`: takes the action out of `PendingActionStore` and runs the tool once. Returns
  `{ tool, result }`. `NotFoundException` when unknown, used or expired.
- `discardAction(actionId)`: removes it. Returns `{ success: true }`.
- After task 6.4 the stored `MODEL` message of the proposing turn is not rewritten by either.

---

## ChatSessionService `[Planned]`

New class, registered in `AiAgentModule`. Uses `PrismaService` only; it never calls `MemoryService` or the
embedding model.

| Method | Does | Tables |
|--------|------|--------|
| `resolve(userId, sessionId?, characterId?)` | Creates a session (title = first 80 characters of the first message), or loads one and requires `session.userId === userId`; otherwise `NotFoundException`. | `chat_sessions` |
| `appendMessage(sessionId, role, content, toolCalls?)` | Inserts one message with the full text and updates `last_message_at`. Returns the message. | `chat_messages`, `chat_sessions` |
| `recentHistory(sessionId, beforeMessageId, limit = 20)` | The last `limit` earlier messages, oldest first, mapped to Gemini's `user` / `model` roles. | `chat_messages` |
| `linkMemory(messageId, memoryId)` | Sets `memory_id` on a message marked important. | `chat_messages` |
| `listSessions(userId, page, pageSize)` | Sessions of the user, newest `last_message_at` first. | `chat_sessions` |
| `listMessages(userId, sessionId, page, pageSize)` | Messages of an owned session, oldest first. | `chat_messages` |
| `deleteSession(userId, sessionId)` | Deletes an owned session; messages cascade, memories stay. | `chat_sessions` |

---

## MemoryService `[Implemented]`

Works on `ai_memories` only.

### 3. saveMemory

- Embeds `content` with `GEMINI_EMBEDDING_MODEL` (default `gemini-embedding-001`, `outputDimensionality: 1536`;
  throws unless exactly 1536 values come back), then in one transaction inserts the row and sets `embedding` and
  `content_tsv` (configuration `simple`).
- Defaults: `source` `MANUAL`, `initial_score` 1.0, `decay_factor` 0.01.
- **AI tool** `save_user_memory` (`MemoryTools.saveUserMemory`): parameters `content` (required), `category`,
  `initialScore`. The server sets `source: 'CHAT'` and `decayFactor: 0.01`; the model cannot choose them.
  After task 6.4 this call **is** how the AI marks a chat message important (D20). What text it should pass
  (its own sentence, or the user's message verbatim) is unconfirmed: `next-steps.md` section 2.2, D20-b.

### 4. searchMemory

- Hybrid score: `(0.7 × cosine similarity + 0.3 × normalised ts_rank) × S0 · e^(−λt)`, where `t` is the time
  since `last_accessed_at`. Decay is computed in the query; nothing is written back as a decayed score.
- Memories below `minScore` (default 0.5, untuned) are not returned. Only returned memories get
  `last_accessed_at = now`.
- **AI tool** `search_semantic_memory` (`MemoryTools.searchSemanticMemory`): `query` (required), `category`, `limit`.
- Also called by `AgentService.buildSystemInstruction` before every turn (limit 5).

### 5. listMemories / deleteMemory

Paginated list, newest first (`pageSize` max 50); delete by ID. No update method.

---

## TtsService `[Implemented]`

### 6. textToSpeech

- `POST https://api.fish.audio/v1/tts` with the resolved voice; returns the MP3 as a stream.
- Voice: request `voiceId` → active character's `voice_id` → `FISH_AUDIO_DEFAULT_VOICE_ID`.
- 503 without `FISH_AUDIO_API_KEY`, 400 when no voice resolves, 500 when Fish.audio fails.
- **Tables**: `characters` (read).

---

## Not in this module

- Memory decay job, pruning, `memory_decay_logs`: de-scoped and dropped (D6).
- Proactive triggers: `server/src/proactive/` (reminder cron and `POST /proactive/trigger`). The 3-hour quiet cron
  and the daily window are not built (D9).
- Email classification: `server/src/email/email-ai.service.ts`. It uses `GenAiProvider` with no tools and writes
  nothing to `ai_memories`.
