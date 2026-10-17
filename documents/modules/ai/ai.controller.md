# AI Agent Controller

- **Class**: `AiAgentController` — `server/src/ai-agent/ai-agent.controller.ts`
- **Base endpoint**: `/api/v1/ai-agent`
- **Auth**: every route needs the application JWT (global `JwtAuthGuard`).
- **Response**: `{ statusCode, message, data }`, except the chat stream (SSE) and TTS (MP3 stream).
- **Description**: streaming chat with the AI agent, confirmation of write actions the AI proposed, memory
  management and search, text-to-speech, chat sessions and their stored messages.

---

## Endpoints

### 1. Streaming chat — `POST /api/v1/ai-agent/chat/stream`

- **Handler**: `chatStream(req.user.userId, dto)` → `AgentService.chatStream`
- **Transport**: Server-Sent Events over POST (`@Sse('chat/stream', { method: RequestMethod.POST })`). Each
  `data:` line is one JSON frame.

#### Request — `ChatStreamDto`

- `message` (`string`, required): the user's message.
- `sessionId` (`string`, UUID, optional): the chat session to continue. Omitted → the server creates a session.
- `characterId` (`string`, UUID, optional in the DTO): the character to answer as. **Required when no `sessionId` is
  sent** (a new session): missing → 400, unknown → 404, both before the stream opens. A new session stores this
  character. With a `sessionId`, the session's stored character is used and `characterId` is ignored. When the stored
  character was deleted (`character_id` null), the turn runs with the default prompt only.

There is no `history` field. The server reads the history from `chat_messages`.

Errors before the stream opens: 400 (new session without `characterId`), 404 (unknown or foreign `sessionId`, or
unknown `characterId` for a new session). No model call is made.

#### Storage

The session is resolved before the stream opens: an unknown `sessionId`, or one that belongs to another user, is 404 and
no model call is made. The first frame is `session`. The user's message is stored before the model is called; the
model's answer is stored when the turn ends normally. A turn that ends with an `error` frame, or that the client aborts,
keeps the `USER` row and stores no `MODEL` row. Steps: `ai.service.md` (`chatStream`). Storage rules: `db.md` section 5.

#### Response frames

| `type` | Fields | Meaning |
|--------|--------|---------|
| `session` | `sessionId` | First frame of every stream. |
| `text` | `content` | A chunk of the Vietnamese answer (`message_vi` only). |
| `tool_call` | `tool`, `args` | A read tool is running. |
| `tool_result` | `tool`, `result` | Its result. |
| `confirmation_required` | `actionId`, `tool`, `args` | A write tool was proposed and **not run**. |
| `error` | `message` | The stream stops (includes the 5-round tool limit). |
| `reply` | `messageId`, `contentJp` | Sent once, after the `MODEL` message is stored and before `done`. `messageId` is the ID to send to TTS. `contentJp` is the Japanese text of the answer, or `null` when the model reply was not valid JSON. Not sent after an `error` or an abort. |
| `done` | — | Normal end. |

---

### 2. Confirm a proposed action — `POST /api/v1/ai-agent/actions/:actionId/confirm`

- **Handler**: `confirmAction(actionId)` → `AgentService.confirmAction`
- Runs, exactly once, the write tool the AI proposed in a `confirmation_required` frame.
- **Response `data`**: `{ tool, result }`. 404 when the action is unknown, already used, or older than 5 minutes.

### 3. Discard a proposed action — `DELETE /api/v1/ai-agent/actions/:actionId`

- **Handler**: `discardAction(actionId)` → `AgentService.discardAction`
- **Response `data`**: `{ success: true }`. 404 as above.

Neither route rewrites the stored `MODEL` message of the turn that proposed the action.

---

### 4. Save a memory — `POST /api/v1/ai-agent/memories`

- **Handler**: `saveMemory(dto)` → `MemoryService.saveMemory`. Returns 201.
- **Request** `SaveMemoryDto`: `content` (required), `category?` (default `GENERAL`), `source?` (default `MANUAL`), `initialScore?`
  (default 1.0), `decayFactor?` (default 0.01).
- Computes a 1536-dimension embedding and the `tsvector`. 503 without `GEMINI_API_KEY`.

### 5. List memories — `GET /api/v1/ai-agent/memories`

- **Handler**: `listMemories(dto)` → `MemoryService.listMemories`
- **Query** `ListMemoryDto`: `category?`, `source?`, `page?` (min 1), `pageSize?` (1–50). Newest first. No search.

### 6. Update a memory — `PATCH /api/v1/ai-agent/memories/:id`

- **Handler**: `updateMemory(id, dto)` → `MemoryService.updateMemory`. Returns 200.
- **Request** `UpdateMemoryDto`: `content?`, `category?` (both from `SaveMemoryDto`). `content` changed → the
  embedding and `content_tsv` are rebuilt. `content: null` counts as not provided. `category: null` clears the category.
- **Response `data`**: the updated row. 404 when the ID is unknown. 503 without
  `GEMINI_API_KEY` when `content` is sent.

### 7. Delete a memory — `DELETE /api/v1/ai-agent/memories/:id`

- **Handler**: `deleteMemory(id)` → `MemoryService.deleteMemory`. 404 when the ID is unknown. A chat message that pointed to
  the memory keeps its text and gets `memory_id = null`.

### 8. Search memories — `POST /api/v1/ai-agent/memories/search`

- **Handler**: `searchMemory(dto)` → `MemoryService.searchMemory`
- **Request** `SearchMemoryDto`: `query` (required), `category?`, `source?`, `limit?` (1–20, default 5),
  `minScore?` (0–1, default 0.5, minimum cosine similarity).
- Hybrid search over `ai_memories` only. It never searches chat messages.

---

### 9. List chat sessions — `GET /api/v1/ai-agent/sessions`

- **Handler**: `listSessions(req.user.userId, dto.page, dto.pageSize)` → `ChatSessionService.listSessions`
- **Query** `ListChatDto`: `page?` (min 1, default 1), `pageSize?` (1–50, default 20).
- **Response `data`**: `{ items, total, page, pageSize }`; sessions of the JWT user, newest `lastMessageAt` first: full rows: `id`, `userId`, `title`, `characterId`,
  `lastMessageAt`, `createdAt`, `updatedAt`.

### 10. Read the messages of a session — `GET /api/v1/ai-agent/sessions/:id/messages`

- **Handler**: `listMessages(req.user.userId, id, dto.page, dto.pageSize)` → `ChatSessionService.listMessages`
- **Query** `ListChatDto`.
- **Response `data`**: `{ items, total, page, pageSize }`; messages oldest first, full rows: `id`, `sessionId`, `role` (`USER` / `MODEL`), `content` (full text; Vietnamese on a `MODEL` row), `contentJp` (Japanese text of a `MODEL` reply; null on `USER` rows and on `MODEL` rows written before the column existed), `toolCalls`,
  `memoryId` (non-null when the message was marked important), `createdAt`.
- 404 when the session does not exist or belongs to another user.

### 11. Delete a chat session — `DELETE /api/v1/ai-agent/sessions/:id`

- **Handler**: `deleteSession(req.user.userId, id)` → `ChatSessionService.deleteSession`
- Deletes the session and its messages. Memories made from those messages are kept. **Response `data`**: `{ success: true }`.
- 404 as above.

---

### 12. Text-to-speech — `POST /api/v1/ai-agent/tts`

- **Handler**: `textToSpeech(req.user.userId, dto, res)` → `TtsService.textToSpeech`
- **Request** `TtsRequestDto`: `messageId` (UUID, required), the ID of a stored chat message. The voice is the
  `voice_id` of the character of the message's session; the text read aloud is the message's `content_jp`.
- **Response**: an MP3 stream (`audio/mpeg`), not the JSON envelope.
- 503 without `FISH_AUDIO_API_KEY` (checked first); 404 when the message does not exist or belongs to another user;
  400 when the session has no character (deleted) or the character has no `voice_id`, or when the message has no Japanese
  text (`content_jp` null or blank); 500 when Fish.audio fails.
