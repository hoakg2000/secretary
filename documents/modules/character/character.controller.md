# Character Controller

- **Class**: `CharacterController` — `server/src/character/character.controller.ts`
- **Base endpoint**: `/api/v1/characters`
- **Auth**: every route needs the application JWT (global `JwtAuthGuard`).
- **Response**: `{ statusCode, message, data }`.
- **Description**: CRUD for AI characters. Many characters can exist; the
  client picks one per chat session (`characterId`). The prompt of a character is the single text `systemPrompt`.

---

## Endpoints

### 1. Create a character — `POST /api/v1/characters`

- **Handler**: `createCharacter(dto)` → `CharacterService.createCharacter`. Returns 201.
- **Request** `CreateCharacterDto`: `name` (required), `voiceId?` (Fish.audio voice), `source?`, `memoryRule?`
  (max 2000 characters; tells the AI which chat messages to remember, null = built-in default), `systemPrompt?`
  (max 20000 characters; added to the default prompt at every chat turn). `slug` is ignored (stripped by the validation pipe): only the seed sets it.
- **Response `data`**: the character.

### 2. List characters — `GET /api/v1/characters`

- **Handler**: `findAllCharacters()`. Newest first. No pagination.

### 3. Get one character — `GET /api/v1/characters/:id`

- **Handler**: `findCharacterById(id)`. 404 when missing.

### 4. Update a character — `PATCH /api/v1/characters/:id`

- **Handler**: `updateCharacter(id, dto)`.
- **Request** `UpdateCharacterDto`: every field of `CreateCharacterDto`, all optional.
- 404 when missing.

### 5. Delete a character — `DELETE /api/v1/characters/:id`

- **Handler**: `removeCharacter(id)`. `chat_sessions.character_id` is set to
  null. 404 when missing. **Response `data`**: the deleted row.
