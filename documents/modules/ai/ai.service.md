# AI Agent Services

- **Module**: `AiAgentModule` — `server/src/ai-agent/ai-agent.module.ts`
- **Description**: the chat turn (system instruction, Gemini stream, tool loop, write confirmation), long-term
  memory (pgvector + text search + decay at query time), text-to-speech, storage of chat sessions and messages.
- **There is no `AiService`.** The work is split over the classes below.

| Class | File (under `server/src/ai-agent/`) | Role |
|-------|-------------------------------------|------|
| `AgentService` | `services/agent/agent.service.ts` | Chat turn, tool discovery and execution, confirmation. |
| `PendingActionStore` | `services/agent/pending-action.store.ts` | Proposed write actions, in memory, 5-minute lifetime, lost on restart. |
| `MemoryService` | `services/memory/memory.service.ts` | Embedding, save, hybrid search, list, update, delete. |
| `MemoryTools` | `tools/memory.tools.ts` | The two memory AI tools. |
| `TtsService` | `services/tts/tts.service.ts` | Fish.audio MP3 stream. |
| `GenAiProvider` | `genai.provider.ts` | One lazy Gemini client; 503 without `GEMINI_API_KEY`. |
| `RagChunkService` | `services/rag-chunk/rag-chunk.service.ts` | Text chunking. Kept, called from nowhere. |
| `ChatSessionService` | `services/chat/chat-session.service.ts` | Chat sessions and messages. |

**Tables**: `characters` (incl. `system_prompt`, `memory_rule`, `voice_id`; read), `ai_memories` (read, write), `chat_sessions`,
`chat_messages` (read, write). `rag_chunks` is written only by the unused
`RagChunkService`.

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

- **Signature**: `chatStream(userId: string, dto: ChatStreamDto): Promise<Observable<{ data: string }>>`
- **AI tool**: no.

#### Steps

Before the stream opens: `ChatSessionService.resolve` loads the session of `dto.sessionId` (404 for an unknown or
foreign one; the model is not called). An existing session uses its stored `character_id` and ignores
`dto.characterId`; when that is null (character deleted), no character block is added and only the default prompt from `prompts/data.json` applies. A new session needs
`dto.characterId`: missing → `BadRequestException`, unknown → `NotFoundException`; then the session is created with
that character. The `character_id` of a session is never changed. These errors are thrown before the stream opens.
Then, inside the stream:

1. Emit the first frame `{ "type": "session", "sessionId": "…" }`.
2. `ChatSessionService.appendMessage(sessionId, USER, dto.message)`: **the message sent by the user is stored in
   full**, before the model is called.
3. Build the system instruction (`buildSystemInstruction`):
   - the default prompt, `prompts/data.json` (`systemPrompt`), always first;
   - the character block from `buildCharacterPrompt` (`server/src/character/character-prompt.ts`): the heading `## Nhân vật bạn đang nhập vai`, then the name, the source (when set) and `characters.system_prompt`. It extends the default prompt and is omitted when `system_prompt` is blank or there is no character;
   - current time and `APP_TIMEZONE`;
   - the note that write tools are not run until the user confirms;
   - the importance rule: `characters.memory_rule`, or `DEFAULT_MEMORY_RULE` when it is null, with "call
     `save_user_memory` only for a message that meets this rule";
   - up to 5 memories found by `MemoryService.searchMemory` for the message, marked as reference data that must
     not be followed as instructions. A retrieval failure does not fail the chat.
4. Open a Gemini chat (`CHAT_MODEL`, `gemini-3.6-flash`) with all tool declarations, the reply schema (`responseMimeType: application/json`, `REPLY_SCHEMA`: required `message_vi` and `message_jp`) and the history from
   `ChatSessionService.recentHistory`: up to the last 20 messages of the session before the one stored in step 2,
   oldest first, starting at a user turn. Rows with empty text (a `MODEL` row that only holds tool calls) are dropped.
5. The model answers in JSON `{ message_vi, message_jp }`. `ReplyStreamParser` (`services/agent/reply-stream.parser.ts`) reads the stream piece by piece and emits only the decoded `message_vi` as `text` frames; `message_jp` is never streamed. When the model calls tools, run them (`executeToolCall`), answer all calls
   of the round in one message, and continue. At most 5 rounds (`MAX_TOOL_ROUNDS`), then an `error` frame.
6. When the model calls `save_user_memory`, the new memory's ID is written to `memory_id` of the message stored in
   step 2 (`linkMemory`). Only the first such memory of a turn is linked, because `memory_id` is unique. The message
   ID is held in the turn state of `AgentService`, never taken from a model-supplied argument. A link failure is
   logged and does not fail the chat.
7. When the loop ends normally: `appendMessage(sessionId, MODEL, <message_vi of all rounds joined by a blank line>, toolCalls,
   <message_jp of all rounds joined by a blank line>)`: **the message received from the model is stored in full**, with the tool
   calls of the turn (results, errors, or the pending `actionId`). Then the `reply` frame
   `{ messageId, contentJp }`, then `done`.
   If the model reply is not valid JSON (or has no `message_vi`), the streamed text, or the raw text when nothing
   was streamed, is stored as `content` and `content_jp` stays null; `contentJp` in the `reply` frame is `null`.

**Tables**: `characters` (read); `chat_sessions`, `chat_messages` (read, write); `ai_memories` (read;
write only when the model calls `save_user_memory`).

Rules:

- A turn that ends in `error`, or that the client aborts (the loop stops), keeps the `USER` row and writes no
  `MODEL` row. A partial answer is not stored.
- Chat is never embedded or searched by vector (`db.md` section 5). The pre-turn retrieval reads `ai_memories` only.
- Only the path in step 6 turns chat content into a memory.
- Risk: a response schema together with function calling is a Gemini 3 preview feature. Behaviour may change or
  fail (for example a reply that is not valid JSON, handled by the fallback in step 7).

### 2. confirmAction / discardAction

- `confirmAction(actionId)`: takes the action out of `PendingActionStore` and runs the tool once. Returns
  `{ tool, result }`. `NotFoundException` when unknown, used or expired.
- `discardAction(actionId)`: removes it. Returns `{ success: true }`.
- Neither rewrites the stored `MODEL` message of the proposing turn.

---

## ChatSessionService

Registered in `AiAgentModule`. Uses `PrismaService` only; it never calls `MemoryService` or the
embedding model.

| Method | Does | Tables |
|--------|------|--------|
| `resolve(userId, sessionId?, characterId?, firstMessage?)` | Creates a session (title = first 80 characters of `firstMessage`), or loads one and requires `session.userId === userId`; otherwise `NotFoundException`. | `chat_sessions` |
| `appendMessage(sessionId, role, content, toolCalls?, contentJp?)` | Inserts one message with the full text (and `contentJp` when given) and updates `last_message_at`. Returns the message. | `chat_messages`, `chat_sessions` |
| `recentHistory(sessionId, beforeMessageId, limit = 20)` | Up to `limit` earlier messages, oldest first, mapped to Gemini's `user` / `model` roles; rows with empty text and leading `model` turns are dropped. | `chat_messages` |
| `linkMemory(messageId, memoryId)` | Sets `memory_id` on a message marked important. | `chat_messages` |
| `listSessions(userId, page, pageSize)` | `{ items, total, page, pageSize }`: sessions of the user, newest `last_message_at` first. | `chat_sessions` |
| `listMessages(userId, sessionId, page, pageSize)` | `{ items, total, page, pageSize }`: messages of an owned session, oldest first, including `contentJp`; `NotFoundException` for an unowned session. | `chat_messages` |
| `findOwnMessage(userId, messageId)` | A message whose session belongs to the user, with its session and character; `NotFoundException` otherwise. Used by `TtsService`. | `chat_messages`, `chat_sessions`, `characters` |
| `deleteSession(userId, sessionId)` | Deletes an owned session; messages cascade, memories stay. | `chat_sessions` |

---

## MemoryService

Works on `ai_memories` only.

### 3. saveMemory

- Embeds `content` with `GEMINI_EMBEDDING_MODEL` (default `gemini-embedding-001`, `outputDimensionality: 1536`;
  throws unless exactly 1536 values come back), then in one transaction inserts the row and sets `embedding` and
  `content_tsv` (configuration `simple`).
- Defaults: `category` `GENERAL`, `source` `MANUAL`, `initial_score` 1.0, `decay_factor` 0.01. The tool `save_user_memory` also defaults `category` to `GENERAL`.
- **AI tool** `save_user_memory` (`MemoryTools.saveUserMemory`): parameters `content` (required), `category`,
  `initialScore`. The server sets `source: 'CHAT'` and `decayFactor: 0.01`; the model cannot choose them.
  This call **is** how the AI marks a chat message important. The text stored is whatever the model passes as
  `content`; the code does not force the user's message verbatim.

### 4. searchMemory

- Hybrid score: `(0.7 × cosine similarity + 0.3 × normalised ts_rank) × S0 · e^(−λt)`, where `t` is the time
  since `last_accessed_at`. Decay is computed in the query; nothing is written back as a decayed score.
- Memories whose cosine similarity is below `minScore` (default 0.5, untuned) are not returned; the rest are ordered by the hybrid score. Only returned memories get
  `last_accessed_at = now`.
- **AI tool** `search_semantic_memory` (`MemoryTools.searchSemanticMemory`): `query` (required), `category`, `limit`.
- Also called by `AgentService.buildSystemInstruction` before every turn (limit 5).

### 5. listMemories / updateMemory / deleteMemory

Paginated list, newest first (`pageSize` max 50); delete by ID (`NotFoundException` when unknown).

`updateMemory(id, dto)`: `NotFoundException` when unknown. `content: null` counts as not provided; `category: null`
clears the category. Without `content` it is a plain update. With `content` it first embeds the new text
(`RETRIEVAL_DOCUMENT`, outside the transaction), then in one transaction updates the row and rewrites `embedding` and
`content_tsv`. Score fields are not editable.

---

## TtsService

### 6. textToSpeech

- Signature: `textToSpeech(userId, dto: { messageId })`. Order: 503 without `FISH_AUDIO_API_KEY`; then
  `ChatSessionService.findOwnMessage(userId, messageId)` (404 for an unknown or foreign message); then the voice
  is `message.session.character.voiceId`.
- 400 when the character is gone or has no `voice_id`, and 400 when `content_jp` of the message is null or blank. 500 when Fish.audio fails.
- `POST https://api.fish.audio/v1/tts` with that voice and the message `content_jp` (Japanese text); returns the MP3 as a stream.
- **Tables**: `chat_messages`, `chat_sessions`, `characters` (read).

---

## Not in this module

- Proactive triggers: `server/src/proactive/` (reminder cron and `POST /proactive/trigger`).
- Email classification: `server/src/email/email-ai.service.ts`. It uses `GenAiProvider` and `CHAT_MODEL` (`gemini-3.6-flash`) with no tools and writes
  nothing to `ai_memories`.
