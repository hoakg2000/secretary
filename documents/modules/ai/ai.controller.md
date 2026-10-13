# AI Agent Controller

- **Class**: `AiAgentController` — `server/src/ai-agent/ai-agent.controller.ts`
- **Base endpoint**: `/api/v1/ai-agent`
- **Auth**: every route needs the application JWT (global `JwtAuthGuard`).
- **Response**: `{ statusCode, message, data }`, except the chat stream (SSE) and TTS (MP3 stream).
- **Description**: streaming chat with the AI agent, confirmation of write actions the AI proposed, memory
  management and search, text-to-speech. After task 6.4 also chat sessions and their stored messages.

Status tags: `[Implemented]` = in the code today. `[Planned]` = designed in `next-steps.md` section 6.4, not built.

## Change log

| Date | Change |
|------|--------|
| 2026-10-13 | Rewritten from the code. Base path is `/api/v1/ai-agent` (was documented as `/api/v1/ai`). Removed endpoints that do not exist: `PUT /memories/:id`, `POST /ai/proactive/trigger` (the route is `POST /proactive/trigger` in the proactive module), `POST /tts/stream` (the route is `POST /tts`). Memory search is `POST /memories/search`; `GET /memories` is a plain paginated list. Added the two action routes. Embedding is 1536 dimensions only. |
| 2026-10-13 | Chat storage (D19, D20) `[Planned]`: the chat endpoint stores the message sent by the user and the message received from the model in `chat_messages`; body gains `sessionId`, loses `history`; new `session` frame; three session endpoints (8–10). Nothing of a chat is written to the vector store unless the AI marks the message important. |

---

## Endpoints

### 1. Streaming chat — `POST /api/v1/ai-agent/chat/stream`

- **Handler**: `chatStream(dto)` → `AgentService.chatStream`
- **Transport**: Server-Sent Events over POST (`@Sse('chat/stream', { method: RequestMethod.POST })`). Each
  `data:` line is one JSON frame.

#### Request `[Implemented]` — `ChatStreamDto`

- `message` (`string`, required): the user's message.
- `characterId` (`string`, optional): character to answer as; default is the active character.
- `history` (`{ role: 'user' | 'model', text }[]`, optional, max 20, each text max 4000 characters): the recent
  turns, **held and sent by the client**. The server stores no chat.

#### Request `[Planned]` — task 6.4

- `message` (`string`, required).
- `sessionId` (`string`, optional): the chat session to continue. Omitted → the server creates a session.
- `characterId` (`string`, optional).
- `history` is removed. The server reads the history from `chat_messages`.

#### What the endpoint does with the messages `[Planned]`

| Step | Action | Table |
|------|--------|-------|
| 1 | Resolve the session: create one for the JWT user, or load `sessionId` and require that it belongs to that user (otherwise 404, and no model call). | `chat_sessions` |
| 2 | Emit the first frame `{ "type": "session", "sessionId": "…" }`. | — |
| 3 | **Store the message sent by the user**, in full, before the model is called. | `chat_messages` (`role: USER`) |
| 4 | Load the last 20 earlier messages of the session as history for the model. | `chat_messages` (read) |
| 5 | Run the turn: system instruction, model stream, tool loop (see `ai.service.md`). | — |
| 6 | If the AI marked the user's message important (it called `save_user_memory`), a memory is written and linked to the message of step 3. | `ai_memories`, `chat_messages.memory_id` |
| 7 | At `done`: **store the message received from the model**, in full (all `text` chunks joined), with the turn's tool calls. | `chat_messages` (`role: MODEL`) |
| 8 | Update `last_message_at` of the session. | `chat_sessions` |

A turn that ends with an `error` frame, or that the client aborts, keeps the `USER` row and stores no `MODEL` row.
The handler must read the user ID from the request (`req.user`); it does not today.

#### Response frames

| `type` | Fields | Status | Meaning |
|--------|--------|--------|---------|
| `session` | `sessionId` | `[Planned]` | First frame of every stream. |
| `text` | `content` | `[Implemented]` | A chunk of the answer. |
| `tool_call` | `tool`, `args` | `[Implemented]` | A read tool is running. |
| `tool_result` | `tool`, `result` | `[Implemented]` | Its result. |
| `confirmation_required` | `actionId`, `tool`, `args` | `[Implemented]` | A write tool was proposed and **not run**. |
| `error` | `message` | `[Implemented]` | The stream stops (includes the 5-round tool limit). |
| `done` | — | `[Implemented]` | Normal end. |

---

### 2. Confirm a proposed action — `POST /api/v1/ai-agent/actions/:actionId/confirm` `[Implemented]`

- **Handler**: `confirmAction(actionId)` → `AgentService.confirmAction`
- Runs, exactly once, the write tool the AI proposed in a `confirmation_required` frame.
- **Response `data`**: `{ tool, result }`. 404 when the action is unknown, already used, or older than 5 minutes.

### 3. Discard a proposed action — `DELETE /api/v1/ai-agent/actions/:actionId` `[Implemented]`

- **Handler**: `discardAction(actionId)` → `AgentService.discardAction`
- **Response `data`**: `{ success: true }`. 404 as above.

After task 6.4 neither route rewrites the stored `MODEL` message of the turn that proposed the action.

---

### 4. Save a memory — `POST /api/v1/ai-agent/memories` `[Implemented]`

- **Handler**: `saveMemory(dto)` → `MemoryService.saveMemory`. Returns 201.
- **Request** `SaveMemoryDto`: `content` (required), `category?`, `source?` (default `MANUAL`), `initialScore?`
  (default 1.0), `decayFactor?` (default 0.01).
- Computes a 1536-dimension embedding and the `tsvector`. 503 without `GEMINI_API_KEY`.

### 5. List memories — `GET /api/v1/ai-agent/memories` `[Implemented]`

- **Handler**: `listMemories(dto)` → `MemoryService.listMemories`
- **Query** `ListMemoryDto`: `category?`, `source?`, `page?` (min 1), `pageSize?` (1–50). Newest first. No search.

### 6. Delete a memory — `DELETE /api/v1/ai-agent/memories/:id` `[Implemented]`

- **Handler**: `deleteMemory(id)` → `MemoryService.deleteMemory`. After task 6.4 a chat message that pointed to
  the memory keeps its text and gets `memory_id = null`.

### 7. Search memories — `POST /api/v1/ai-agent/memories/search` `[Implemented]`

- **Handler**: `searchMemory(dto)` → `MemoryService.searchMemory`
- **Request** `SearchMemoryDto`: `query` (required), `category?`, `source?`, `limit?` (1–20, default 5),
  `minScore?` (0–1, default 0.5, minimum cosine similarity).
- Hybrid search over `ai_memories` only. It never searches chat messages.

There is no memory update endpoint (backlog).

---

### 8. List chat sessions — `GET /api/v1/ai-agent/sessions` `[Planned]`

- **Query**: `page?`, `pageSize?` (max 50).
- **Response `data`**: sessions of the JWT user, newest `lastMessageAt` first: `id`, `title`, `characterId`,
  `lastMessageAt`, `createdAt`.

### 9. Read the messages of a session — `GET /api/v1/ai-agent/sessions/:id/messages` `[Planned]`

- **Query**: `page?`, `pageSize?` (max 50).
- **Response `data`**: messages oldest first: `id`, `role` (`USER` / `MODEL`), `content` (full text), `toolCalls`,
  `memoryId` (non-null when the message was marked important), `createdAt`.
- 404 when the session does not exist or belongs to another user.

### 10. Delete a chat session — `DELETE /api/v1/ai-agent/sessions/:id` `[Planned]`

- Deletes the session and its messages. Memories made from those messages are kept.
- 404 as above.

---

### 11. Text-to-speech — `POST /api/v1/ai-agent/tts` `[Implemented]`

- **Handler**: `textToSpeech(dto, res)` → `TtsService.textToSpeech`
- **Request** `TtsRequestDto`: `text` (required), `voiceId?`. Voice resolution: request → active character's
  `voice_id` → `FISH_AUDIO_DEFAULT_VOICE_ID`.
- **Response**: an MP3 stream (`audio/mpeg`), not the JSON envelope.
- 503 without `FISH_AUDIO_API_KEY`; 400 when no voice resolves; 500 when Fish.audio fails.
