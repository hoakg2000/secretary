# Character Controller

- **Class**: `CharacterController` — `server/src/character/character.controller.ts`
- **Base endpoint**: `/api/v1/characters`
- **Auth**: every route needs the application JWT (global `JwtAuthGuard`).
- **Response**: `{ statusCode, message, data }`.
- **Description**: CRUD for AI characters and their personas (prompt parts). Many characters can exist; the
  client picks one per chat session (`characterId`). Personas are returned with the character; there is no separate persona list route.

---

## Endpoints

### 1. Create a character — `POST /api/v1/characters`

- **Handler**: `createCharacter(dto)` → `CharacterService.createCharacter`. Returns 201.
- **Request** `CreateCharacterDto`: `name` (required), `voiceId?` (Fish.audio voice), `source?`, `memoryRule?`
  (max 2000 characters; tells the AI which chat messages to remember, null = built-in default).
- **Response `data`**: the character with `personas`.

### 2. List characters — `GET /api/v1/characters`

- **Handler**: `findAllCharacters()`. Newest first, each with `personas`. No pagination.

### 3. Get one character — `GET /api/v1/characters/:id`

- **Handler**: `findCharacterById(id)`. With `personas`. 404 when missing.

### 4. Update a character — `PATCH /api/v1/characters/:id`

- **Handler**: `updateCharacter(id, dto)`.
- **Request** `UpdateCharacterDto`: every field of `CreateCharacterDto`, all optional.
- 404 when missing.

### 5. Delete a character — `DELETE /api/v1/characters/:id`

- **Handler**: `removeCharacter(id)`. Personas are deleted with it (cascade). `chat_sessions.character_id` is set to
  null. 404 when missing. **Response `data`**: the deleted row.

### 6. Add a persona — `POST /api/v1/characters/:id/personas`

- **Handler**: `addPersona(id, dto)`. Returns 201. 404 when the character is missing.
- **Request** `CreatePersonaDto`: `type` (`PersonaType`: `SYSTEM_PROMPT`, `TONE`, `IDENTITY`,
  `KNOWLEDGE_BACKGROUND`, `RELATIONSHIP_DYNAMICS`, `OTHER`), `value` (text). Both required.

### 7. Update a persona — `PATCH /api/v1/characters/:id/personas/:personaId`

- **Handler**: `updatePersona(id, personaId, dto)`. **Request** `UpdatePersonaDto`: `type?`, `value?`.
- 404 when the persona does not exist or belongs to another character.

### 8. Delete a persona — `DELETE /api/v1/characters/:id/personas/:personaId`

- **Handler**: `removePersona(id, personaId)`. 404 as above.
