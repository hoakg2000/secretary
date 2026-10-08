# AI Agent & Semantic Memory Controller

- **Base Endpoint**: `/api/v1/ai`
- **General Description**: Controller handling interactive AI streaming chat, streaming Text-to-Speech (TTS), full CRUD and hybrid search management for AI semantic memories, and manual trigger for the proactive AI orchestrator.

---

## List of Endpoints

### 1. Interactive Streaming Chat

- **Endpoint**: `POST /api/v1/ai/chat/stream`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Handles real-time interactive chat with the active AI Agent, streaming response chunks back to the client using Server-Sent Events (SSE).

#### Data Transfer Objects (DTO)

- **Request DTO**: `StreamChatDto`
  - `message` (`string`, required): User chat message input.
  - `characterId` (`string`, optional): Optional specific character ID override; defaults to active character.
  - `sessionId` (`string`, optional): Session identifier to maintain conversation state.

- **Response DTO**: `Observable<MessageEvent>` (Server-Sent Events)
  - `data` (`string`): Streaming text token chunk or JSON metadata frame.

---

### 2. Streaming Text-to-Speech (TTS)

- **Endpoint**: `POST /api/v1/ai/tts/stream`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Receives text input and returns an audio stream from Fish.audio API corresponding to the active character's `voice_id`.

#### Data Transfer Objects (DTO)

- **Request DTO**: `StreamTtsDto`
  - `text` (`string`, required): Text payload to synthesize into audio stream.
  - `voiceId` (`string`, optional): Override voice identifier; defaults to current character's `voice_id`.

- **Response DTO**: `StreamableFile` / Audio Stream
  - `contentType` (`string`): Audio MIME type (e.g., `audio/mpeg`).

---

### 3. Query & Hybrid Search AI Memories

- **Endpoint**: `GET /api/v1/ai/memories`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Searches and lists stored AI memories using Hybrid Search combining Vector Cosine Distance (1536 or 3072 dimensions with HNSW Index) and PostgreSQL Full-Text Search (`tsvector`), weighted by the exponential Memory Decay formula $S(t) = S_0 \cdot e^{-\lambda t}$.

#### Data Transfer Objects (DTO)

- **Request DTO**: `QueryMemoryDto`
  - `query` (`string`, optional): Text query for hybrid search matching.
  - `category` (`string`, optional): Filter memory by category tag.
  - `source` (`string`, optional, enum: `['CHAT', 'EMAIL', 'MANUAL']`): Filter by memory origin.
  - `limit` (`number`, optional, default: 20): Maximum number of results to return.
  - `minScore` (`number`, optional): Minimum relevance score threshold.

- **Response DTO**: `MemoryListResponseDto`
  - `items` (`MemoryResponseDto[]`): Array of matching AI memory records:
    - `id` (`string`): Memory UUID.
    - `content` (`string`): Memory text content.
    - `category` (`string`): Category classification.
    - `source` (`string`): Origin source (`CHAT`, `EMAIL`, `MANUAL`).
    - `initialScore` (`number`): Base relevance score $S_0$.
    - `decayFactor` (`number`): Score decay rate $\lambda$.
    - `currentScore` (`number`): Decayed memory strength $S(t) = S_0 \cdot e^{-\lambda t}$.
    - `similarityScore` (`number`, optional): Hybrid vector + text similarity score.
    - `lastAccessedAt` (`string`): ISO 8601 timestamp of last memory access.
    - `createdAt` (`string`): ISO 8601 timestamp of creation.
  - `total` (`number`): Total records matching search criteria.

---

### 4. Manually Add AI Memory

- **Endpoint**: `POST /api/v1/ai/memories`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Adds a new memory manually to `ai_memories`. Automatically calls the Embedding Service to compute its embedding vector ($1536$ or $3072$ dimensions) for `pgvector` HNSW indexing, generates the PostgreSQL Full-Text Search representation `content_tsv`, and initializes $S_0$ and $\lambda$.

#### Data Transfer Objects (DTO)

- **Request DTO**: `CreateMemoryDto`
  - `content` (`string`, required): Memory text content.
  - `category` (`string`, required): Memory category classifier.
  - `source` (`string`, optional, enum: `['CHAT', 'EMAIL', 'MANUAL']`): Defaults to `MANUAL`.
  - `initialScore` (`number`, optional, default: 1.0): Base memory relevance score $S_0$.
  - `decayFactor` (`number`, optional, default: 0.05): Score decay rate $\lambda$.

- **Response DTO**: `MemoryResponseDto`
  - `id` (`string`): UUID of created memory.
  - `content` (`string`): Stored memory text.
  - `category` (`string`): Memory category.
  - `source` (`string`): Origin source.
  - `initialScore` (`number`): Base relevance score $S_0$.
  - `decayFactor` (`number`): Score decay rate $\lambda$.
  - `currentScore` (`number`): Current computed memory score $S(t)$.
  - `createdAt` (`string`): ISO timestamp of creation.

---

### 5. Update AI Memory Content

- **Endpoint**: `PUT /api/v1/ai/memories/:id`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Updates an existing memory's text content, recalculates its embedding vector ($1536/3072$ dimensions) and `content_tsv`, updates its `decay_factor` $\lambda$, and refreshes `last_accessed_at`.

#### Data Transfer Objects (DTO)

- **Request DTO**: `UpdateMemoryDto`
  - `id` (`string`, path param): UUID of memory to update.
  - `content` (`string`, optional): Updated text content.
  - `category` (`string`, optional): Updated category tag.
  - `decayFactor` (`number`, optional): Updated decay factor parameter $\lambda$.

- **Response DTO**: `MemoryResponseDto`
  - `id` (`string`): UUID of updated memory.
  - `content` (`string`): Updated text content.
  - `category` (`string`): Category tag.
  - `initialScore` (`number`): Base relevance score $S_0$.
  - `decayFactor` (`number`): Score decay rate $\lambda$.
  - `currentScore` (`number`): Recalculated memory score $S(t)$.
  - `lastAccessedAt` (`string`): Updated access timestamp.


---

### 6. Delete AI Memory

- **Endpoint**: `DELETE /api/v1/ai/memories/:id`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Permanently deletes or disables a memory record from the `ai_memories` table in the knowledge base.

#### Data Transfer Objects (DTO)

- **Request DTO**: `DeleteMemoryParamsDto`
  - `id` (`string`, path param): UUID of the target memory record.

- **Response DTO**: `DeleteMemoryResponseDto`
  - `success` (`boolean`): Deletion execution result status.
  - `id` (`string`): ID of deleted memory.

---

### 7. Trigger Proactive Agent Orchestrator (Manual)

- **Endpoint**: `POST /api/v1/ai/proactive/trigger`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: **Manually** triggers the Proactive Orchestrator to assess user context, urgent schedule/events, or quiet periods, and optionally dispatch proactive push/Telegram messages.

> **Note — Automatic Fallback Trigger**: The **3-hour Quiet Cron** (`@Cron('0 */3 * * *')`) is implemented as `proactiveFallbackCronJob` in `AiService` (Ref: `ai/ai.service.md`). It runs automatically server-side every 3 hours and calls `triggerProactiveOrchestrator` internally when zero activity is detected. It is **not** exposed as an HTTP endpoint.

#### Data Transfer Objects (DTO)

- **Request DTO**: `TriggerProactiveDto`
  - `reason` (`string`, optional): Manual trigger cause or contextual trace note.

- **Response DTO**: `ProactiveTriggerResponseDto`
  - `triggered` (`boolean`): Whether a proactive communication message was initiated.
  - `actionTaken` (`string`): Execution summary or skip reason.
