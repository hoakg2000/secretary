# AI Agent & Semantic Memory Service

- **General Description**: Core business service managing real-time chat execution, Fish.audio TTS integration, `pgvector` hybrid search memory store (CRUD + RAG extraction), mathematical memory score decay processing ($S(t) = S_0 \cdot e^{-\lambda t}$), and proactive notification orchestrations.
- **Accessed Database Tables**:
  - `ai_memories`
  - `memory_decay_logs`
  - `rag_chunks`
  - `characters`
  - `personas`

---

## Registered AI Tools Catalog (LLM Function Calling)

The system automatically scans and registers the following 5 AI Tools via `@AiTool()` decorator across backend services to empower the AI Agent:

| Tool Name | Originating Service | Description | Parameters |
| :--- | :--- | :--- | :--- |
| **`get_finance_summary`** | `FinanceService` | Retrieves financial fluctuation report (income, expense, balance) by cycle. | `period` (`day`/`week`/`month`/`year`), `month` (opt), `year` (opt) |
| **`get_calendar_events`** | `CalendarService` | Retrieves local proxy calendar events within an optional time window. | `startDate` (ISO 8601, opt), `endDate` (ISO 8601, opt) |
| **`create_calendar_event`** | `CalendarService` | Creates new calendar event in local calendar and syncs to Google Calendar. | `title` (req), `startTime` (req), `endTime` (req), `description`, `location` |
| **`search_ai_memories`** | `AiService` | Queries semantic memory using vector cosine similarity and full-text keyword matching. | `query` (req), `category` (opt), `limit` (opt) |
| **`create_ai_memory`** | `AiService` | Extracts and persists a new semantic memory entry into the AI knowledge base. | `content` (req), `category` (req) |

---

## List of Methods

### 1. streamChat

- **Task Description**: Coordinates user message processing:
  1. Retrieves active character persona context (`characters`, `personas`) including system prompts, tone, background, and relationship dynamics.
  2. Executes Hybrid Search on `ai_memories` to retrieve relevant decayed memories for RAG prompt augmentation.
  3. Binds the registered AI Tools (`get_finance_summary`, `get_calendar_events`, `create_calendar_event`, `search_ai_memories`, `create_ai_memory`) to the LLM session.
  4. Manages tool execution loops when the model calls function tools.
  5. Asynchronously chunks conversation turns into `rag_chunks` for background fact extraction.
  6. Streams output tokens back via Server-Sent Events (SSE).
- **Accessed Tables**: `characters`, `personas`, `ai_memories`, `rag_chunks` (Read, Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `dto`: `StreamChatDto` - DTO with user chat prompt, optional character ID, and session ID.

- **Output**:
  - `Observable<MessageEvent>`: Stream of chat output tokens and tool invocation frames.

---

### 2. streamTts

- **Task Description**: Interacts with the Fish.audio API using the target character's `voice_id` to convert input text into a live streaming audio payload.
- **Accessed Tables**: `characters` (Read)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `dto`: `StreamTtsDto` - Text payload and optional voice identifier override.

- **Output**:
  - `Promise<StreamableFile>`: Streaming audio payload response.

---

### 3. searchMemories

- **Task Description**: Executes **Hybrid Search** on `ai_memories` combining Semantic Vector Cosine Distance and PostgreSQL Full-Text Search, weighted by the exponential Memory Decay formula:
  1. **Vector Cosine Distance**: Calculates semantic distance using $1536$ or $3072$ dimension embeddings (`vector_cosine_ops`) indexed with **HNSW Index**:
     $$\text{VectorSimilarity} = 1 - (\text{embedding} \Leftrightarrow \text{query\_vector})$$
  2. **Full-Text Search (FTS)**: Computes keyword lexical ranking using PostgreSQL `tsvector` (`content_tsv`) with `ts_rank_cd`:
     $$\text{TextScore} = \text{ts\_rank\_cd}(\text{content\_tsv}, \text{plainto\_tsquery}('english', \text{query}))$$
  3. **Memory Decay Weighting**: Applies exponential decay based on elapsed time $t$ (days since `last_accessed_at` or `created_at`):
     $$S(t) = S_0 \cdot e^{-\lambda t}$$
     where $S_0$ is the base relevance score and $\lambda$ is the decay factor.
  4. **Combined Ranking Score**:
     $$\text{FinalScore} = \left( \alpha \cdot \text{VectorSimilarity} + (1 - \alpha) \cdot \text{TextScore} \right) \cdot S(t)$$
     (with default $\alpha = 0.7$).
  5. Updates `last_accessed_at = NOW()` for retrieved memories and logs access events into `memory_decay_logs`.
- **Accessed Tables**: `ai_memories` (Read, Write), `memory_decay_logs` (Write)
- **AI Tool Integration**:
  - **Tool Name**: `search_ai_memories`
  - **Tool Description**: `Queries AI semantic knowledge base using vector similarity and text keywords.`
  - **Parameters Schema**:
    - `query` (`string`, required): Search string to embed and match against stored memories.
    - `category` (`string`, optional): Optional category filter.
    - `limit` (`number`, optional): Limit number of memory results.

#### Input / Output

- **Input**:
  - `queryDto`: `QueryMemoryDto` - DTO containing text query, category, source filters, and limit.

- **Output**:
  - `Promise<MemoryListResponseDto>`: Ranked list of matched memories with current decay scores $S(t)$ and similarity rankings.

---

### 4. createMemory

- **Task Description**: Stores new memory content into `ai_memories`:
  1. Calls Embedding Service to generate vector embedding ($1536$ or $3072$ dimensions) for `pgvector` HNSW indexing.
  2. Generates PostgreSQL Full-Text Search representation `content_tsv` via `to_tsvector('english', content)`.
  3. Initializes base score $S_0 = 1.0$, sets decay rate factor $\lambda = 0.05$, and sets `last_accessed_at = NOW()`.
- **Accessed Tables**: `ai_memories` (Write)
- **AI Tool Integration**:
  - **Tool Name**: `create_ai_memory`
  - **Tool Description**: `Creates and stores a new semantic memory entry into the AI memory store.`
  - **Parameters Schema**:
    - `content` (`string`, required): Memory text content to store.
    - `category` (`string`, required): Category tag (e.g., 'preference', 'fact', 'user_instruction').

#### Input / Output

- **Input**:
  - `createDto`: `CreateMemoryDto` - Content, category, source tag (`CHAT`/`EMAIL`/`MANUAL`), and initial score.

- **Output**:
  - `Promise<MemoryResponseDto>`: Saved memory record metadata with initial score $S_0$ and decay factor $\lambda$.

---

### 5. updateMemory

- **Task Description**: Updates memory content, regenerates vector embedding ($1536/3072$ dimensions), recalculates `content_tsv`, updates `decay_factor` $\lambda$, and refreshes `last_accessed_at`.
- **Accessed Tables**: `ai_memories` (Read, Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `id` (`string`): Target memory UUID.
  - `updateDto`: `UpdateMemoryDto` - Memory fields to update.

- **Output**:
  - `Promise<MemoryResponseDto>`: Updated memory record object.

---

### 6. deleteMemory

- **Task Description**: Permanently deletes or disables a memory record from `ai_memories` table.
- **Accessed Tables**: `ai_memories` (Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `id` (`string`): UUID of the memory record to remove.

- **Output**:
  - `Promise<DeleteMemoryResponseDto>`: Status flag confirming deletion.

---

### 7. triggerProactiveOrchestrator

- **Task Description**: Evaluates recent activity context, calendar events, unread notifications, and quiet periods (3-hour quiet cron or 5:20 PM daily window) to autonomously decide whether to initiate a conversation or push real-time alerts via Telegram Bot API or Push Notifications.
- **Accessed Tables**: `ai_memories`, `memory_decay_logs` (Read, Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `triggerDto`: `TriggerProactiveDto` - Contextual metadata/reason for trigger request.

- **Output**:
  - `Promise<ProactiveTriggerResponseDto>`: Evaluation result and action status summary.

---

### 8. processMemoryDecayJob

- **Task Description**: Periodic background cron worker that recalculates decayed memory scores for all active records in `ai_memories` according to $S(t) = S_0 \cdot e^{-\lambda t}$, writes historical calculation logs into `memory_decay_logs`, and prunes or deactivates obsolete memories whose score falls below a retention threshold (e.g., $S(t) < 0.10$).
- **Accessed Tables**: `ai_memories` (Read, Update), `memory_decay_logs` (Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**: None

- **Output**:
  - `Promise<{ processedCount: number; prunedCount: number }>`: Summary statistics of decayed and pruned memories.
