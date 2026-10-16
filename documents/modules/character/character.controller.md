# Character Controller

- **Class**: `CharacterController` — `server/src/character/character.controller.ts`
- **Base endpoint**: `/api/v1/characters`
- **Auth**: every route needs the application JWT (global `JwtAuthGuard`).
- **Response**: `{ statusCode, message, data }`.
- **Description**: CRUD for AI characters and their personas (prompt parts), and selection of the single active
  character. Personas are returned with the character; there is no separate persona list route.

Status tags: `[Implemented]` = in the code today. `[Planned]` = designed, not built.

## Change log

| Date | Change |
|------|--------|
| 2026-10-16 | Rewritten from the code. Update routes are `PATCH` (were `PUT`). Removed `GET /characters/:id/personas` (personas come with the character). Added `PATCH /characters/:id/active`. Added `memoryRule` to the create / update body. Persona routes check that the persona belongs to the character in the URL. |

---

## Endpoints

### 1. Create a character — `POST /api/v1/characters` `[Implemented]`

- **Handler**: `createCharacter(dto)` → `CharacterService.createCharacter`. Returns 201.
- **Request** `CreateCharacterDto`: `name` (required), `voiceId?` (Fish.audio voice), `source?`, `memoryRule?`
  (max 2000 characters; tells the AI which chat messages to remember, null = built-in default), `isActive?`
  (default false).
- `isActive: true` deactivates every other character in the same transaction.
- **Response `data`**: the character with `personas`.

### 2. List characters — `GET /api/v1/characters` `[Implemented]`

- **Handler**: `findAllCharacters()`. Newest first, each with `personas`. No pagination.

### 3. Get one character — `GET /api/v1/characters/:id` `[Implemented]`

- **Handler**: `findCharacterById(id)`. With `personas`. 404 when missing.

### 4. Update a character — `PATCH /api/v1/characters/:id` `[Implemented]`

- **Handler**: `updateCharacter(id, dto)`.
- **Request** `UpdateCharacterDto`: every field of `CreateCharacterDto`, all optional.
- `isActive: true` deactivates the others. 404 when missing. Setting `isActive: false` is allowed and leaves no
  active character.

### 5. Delete a character — `DELETE /api/v1/characters/:id` `[Implemented]`

- **Handler**: `removeCharacter(id)`. Personas are deleted with it (cascade). `chat_sessions.character_id` is set to
  null. 404 when missing. **Response `data`**: the deleted row.

### 6. Make a character active — `PATCH /api/v1/characters/:id/active` `[Implemented]`

- **Handler**: `setActiveCharacter(id)`. Deactivates the others and activates this one in one transaction.
  404 when missing.

### 7. Add a persona — `POST /api/v1/characters/:id/personas` `[Implemented]`

- **Handler**: `addPersona(id, dto)`. Returns 201. 404 when the character is missing.
- **Request** `CreatePersonaDto`: `type` (`PersonaType`: `SYSTEM_PROMPT`, `TONE`, `IDENTITY`,
  `KNOWLEDGE_BACKGROUND`, `RELATIONSHIP_DYNAMICS`, `OTHER`), `value` (text). Both required.

### 8. Update a persona — `PATCH /api/v1/characters/:id/personas/:personaId` `[Implemented]`

- **Handler**: `updatePersona(id, personaId, dto)`. **Request** `UpdatePersonaDto`: `type?`, `value?`.
- 404 when the persona does not exist or belongs to another character.

### 9. Delete a persona — `DELETE /api/v1/characters/:id/personas/:personaId` `[Implemented]`

- **Handler**: `removePersona(id, personaId)`. 404 as above.
