# AI Agent Services

- **Module**: `AiAgentModule` — `server/src/ai-agent/ai-agent.module.ts`
- **Description**: the chat turn (system instruction, Gemini stream, tool loop, write confirmation), long-term
  memory (pgvector + text search + decay at query time), text-to-speech, storage of chat sessions and messages.
- **There is no `AiService`.** The work is split over the classes below.

| Class | File (under `server/src/ai-agent/`) | Role | Status |
|-------|-------------------------------------|------|--------|
| `AgentService` | `services/agent/agent.service.ts` | Chat turn, tool discovery and execution, confirmation. | `[Implemented]` |
| `PendingActionStore` | `services/agent/pending-action.store.ts` | Proposed write actions, in memory, 5-minute lifetime, lost on restart. | `[Implemented]` |
| `MemoryService` | `services/memory/memory.service.ts` | Embedding, save, hybrid search, list, delete. | `[Implemented]` |
| `MemoryTools` | `tools/memory.tools.ts` | The two memory AI tools. | `[Implemented]` |
| `TtsService` | `services/tts/tts.service.ts` | Fish.audio MP3 stream. | `[Implemented]` |
| `GenAiProvider` | `genai.provider.ts` | One lazy Gemini client; 503 without `GEMINI_API_KEY`. | `[Implemented]` |
| `RagChunkService` | `services/rag-chunk/rag-chunk.service.ts` | Text chunking. Kept, called from nowhere. | `[Implemented]` (unused) |
| `ChatSessionService` | `services/chat/chat-session.service.ts` | Chat sessions and messages. | `[Implemented]` |

**Tables**: `characters` (incl. `memory_rule`), `personas` (read), `ai_memories` (read, write), `chat_sessions`,
`chat_messages` (read, write). `rag_chunks` is written only by the unused
`RagChunkService`.

Status tags: `[Implemented]` = in the code today. `[Planned]` = designed, not built (none left in this file).

## Change log

| Date | Change |
|------|--------|
| 2026-10-13 | Rewritten from the code. `AiService` does not exist: replaced by the class table above. Tool catalog corrected to the ten real tools and their confirmation flag. Removed what does not exist: `updateMemory`, `processMemoryDecayJob`, `memory_decay_logs` (dropped), `triggerProactiveOrchestrator` and `proactiveFallbackCronJob` (the proactive module has only a reminder cron), chunking of chat turns into `rag_chunks`. Corrected: embedding 1536 dimensions, text search configuration `simple`, default λ 0.01, `ts_rank` normalised, `minScore`. Added the confirmation gate, the 5-round limit and the pre-turn memory retrieval. |
| 2026-10-13 | Chat storage: new `ChatSessionService`; `AgentService.chatStream` stores the user's message and the model's answer in full in `chat_messages` and takes the history from there; the importance rule of the character is added to the system instruction; `save_user_memory` links the memory to the chat message. Chat is never written to the vector store otherwise. |
| 2026-10-16 | Chat storage verified against `agent.service.ts` and `chat-session.service.ts`: every `[Planned]` tag is now `[Implemented]`. Corrected: `chatStream(userId, dto)` returns a `Promise<Observable>` and resolves the session before the stream opens; `resolve` takes a fourth argument `firstMessage`; the default memory rule is `DEFAULT_MEMORY_RULE`; only the first `save_user_memory` of a turn is linked. Decision IDs and links to deleted planning files removed. |
| 2026-10-16 | Review fixes: `minScore` filters on cosine similarity, not on the hybrid score; method headings tagged; `RagChunkService` tag; the quiet cron is `[De-scoped]`. |

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

### 1. chatStream `[Implemented]`

- **Signature**: `chatStream(userId: string, dto: ChatStreamDto): Promise<Observable<{ data: string }>>`
- **AI tool**: no.

#### Steps `[Implemented]`

Before the stream opens: `ChatSessionService.resolve` loads the session of `dto.sessionId` (404 for an unknown or
foreign one; the model is not called) or creates one; the character is `dto.characterId`, else the session's
character, else the active character. Then, inside the stream:

1. Emit the first frame `{ "type": "session", "sessionId": "…" }`.
2. `ChatSessionService.appendMessage(sessionId, USER, dto.message)`: **the message sent by the user is stored in
   full**, before the model is called.
3. Build the system instruction (`buildSystemInstruction`):
   - persona of the character (`characters`, `personas`);
   - current time and `APP_TIMEZONE`;
   - the note that write tools are not run until the user confirms;
   - the importance rule: `characters.memory_rule`, or `DEFAULT_MEMORY_RULE` when it is null, with "call
     `save_user_memory` only for a message that meets this rule";
   - up to 5 memories found by `MemoryService.searchMemory` for the message, marked as reference data that must
     not be followed as instructions. A retrieval failure does not fail the chat.
4. Open a Gemini chat (`gemini-2.5-flash`) with all tool declarations and the history from
   `ChatSessionService.recentHistory`: the last 20 messages of the session before the one stored in step 2,
   oldest first, starting at a user turn.
5. Stream the answer as `text` frames. When the model calls tools, run them (`executeToolCall`), answer all calls
   of the round in one message, and continue. At most 5 rounds (`MAX_TOOL_ROUNDS`), then an `error` frame.
6. When the model calls `save_user_memory`, the new memory's ID is written to `memory_id` of the message stored in
   step 2 (`linkMemory`). Only the first such memory of a turn is linked, because `memory_id` is unique. The message
   ID is held in the turn state of `AgentService`, never taken from a model-supplied argument. A link failure is
   logged and does not fail the chat.
7. When the loop ends normally: `appendMessage(sessionId, MODEL, <all text chunks joined>, toolCalls)`: **the
   message received from the model is stored in full**, with the tool calls of the turn (results, errors, or the
   pending `actionId`). Then `done`.

**Tables**: `characters`, `personas` (read); `chat_sessions`, `chat_messages` (read, write); `ai_memories` (read;
write only when the model calls `save_user_memory`).

Rules:

- A turn that ends in `error`, or that the client aborts (the loop stops), keeps the `USER` row and writes no
  `MODEL` row. A partial answer is not stored.
- No embedding is computed for a chat message as such. The chat tables are never searched by vector, and the
  pre-turn retrieval keeps reading `ai_memories` only.
- Only the path in step 6 turns chat content into a memory. There is no per-message or per-session embedding and no
  summary job.

### 2. confirmAction / discardAction `[Implemented]`

- `confirmAction(actionId)`: takes the action out of `PendingActionStore` and runs the tool once. Returns
  `{ tool, result }`. `NotFoundException` when unknown, used or expired.
- `discardAction(actionId)`: removes it. Returns `{ success: true }`.
- Neither rewrites the stored `MODEL` message of the proposing turn.

---

## ChatSessionService `[Implemented]`

Registered in `AiAgentModule`. Uses `PrismaService` only; it never calls `MemoryService` or the
embedding model.

| Method | Does | Tables |
|--------|------|--------|
| `resolve(userId, sessionId?, characterId?, firstMessage?)` | Creates a session (title = first 80 characters of `firstMessage`), or loads one and requires `session.userId === userId`; otherwise `NotFoundException`. | `chat_sessions` |
| `appendMessage(sessionId, role, content, toolCalls?)` | Inserts one message with the full text and updates `last_message_at`. Returns the message. | `chat_messages`, `chat_sessions` |
| `recentHistory(sessionId, beforeMessageId, limit = 20)` | The last `limit` earlier messages, oldest first, mapped to Gemini's `user` / `model` roles; leading `model` turns are dropped. | `chat_messages` |
| `linkMemory(messageId, memoryId)` | Sets `memory_id` on a message marked important. | `chat_messages` |
| `listSessions(userId, page, pageSize)` | `{ items, total, page, pageSize }`: sessions of the user, newest `last_message_at` first. | `chat_sessions` |
| `listMessages(userId, sessionId, page, pageSize)` | `{ items, total, page, pageSize }`: messages of an owned session, oldest first; `NotFoundException` for an unowned session. | `chat_messages` |
| `deleteSession(userId, sessionId)` | Deletes an owned session; messages cascade, memories stay. | `chat_sessions` |

---

## MemoryService `[Implemented]`

Works on `ai_memories` only.

### 3. saveMemory `[Implemented]`

- Embeds `content` with `GEMINI_EMBEDDING_MODEL` (default `gemini-embedding-001`, `outputDimensionality: 1536`;
  throws unless exactly 1536 values come back), then in one transaction inserts the row and sets `embedding` and
  `content_tsv` (configuration `simple`).
- Defaults: `source` `MANUAL`, `initial_score` 1.0, `decay_factor` 0.01.
- **AI tool** `save_user_memory` (`MemoryTools.saveUserMemory`): parameters `content` (required), `category`,
  `initialScore`. The server sets `source: 'CHAT'` and `decayFactor: 0.01`; the model cannot choose them.
  This call **is** how the AI marks a chat message important. The text stored is whatever the model passes as
  `content`; the code does not force the user's message verbatim.

### 4. searchMemory `[Implemented]`

- Hybrid score: `(0.7 × cosine similarity + 0.3 × normalised ts_rank) × S0 · e^(−λt)`, where `t` is the time
  since `last_accessed_at`. Decay is computed in the query; nothing is written back as a decayed score.
- Memories whose cosine similarity is below `minScore` (default 0.5, untuned) are not returned; the rest are ordered by the hybrid score. Only returned memories get
  `last_accessed_at = now`.
- **AI tool** `search_semantic_memory` (`MemoryTools.searchSemanticMemory`): `query` (required), `category`, `limit`.
- Also called by `AgentService.buildSystemInstruction` before every turn (limit 5).

### 5. listMemories / deleteMemory `[Implemented]`

Paginated list, newest first (`pageSize` max 50); delete by ID. No update method.

---

## TtsService `[Implemented]`

### 6. textToSpeech `[Implemented]`

- `POST https://api.fish.audio/v1/tts` with the resolved voice; returns the MP3 as a stream.
- Voice: request `voiceId` → active character's `voice_id` → `FISH_AUDIO_DEFAULT_VOICE_ID`.
- 503 without `FISH_AUDIO_API_KEY`, 400 when no voice resolves, 500 when Fish.audio fails.
- **Tables**: `characters` (read).

---

## Not in this module

- Memory decay job, pruning, `memory_decay_logs`: de-scoped and dropped.
- Proactive triggers: `server/src/proactive/` (reminder cron and `POST /proactive/trigger`). The 3-hour quiet cron
  and the daily window are `[De-scoped]`.
- Email classification: `server/src/email/email-ai.service.ts`. It uses `GenAiProvider` with no tools and writes
  nothing to `ai_memories`.
