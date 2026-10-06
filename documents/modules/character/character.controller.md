# Character & Persona Controller

- **Base Endpoint**: `/api/v1/characters`
- **General Description**: Controller handling the management of AI characters and their associated persona attribute configurations (prompts, tones, identity, knowledge background, relationship dynamics, etc.).

---

## List of Endpoints

### 1. Get All Characters

- **Endpoint**: `GET /api/v1/characters`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Retrieves a list of all registered AI characters in the system.

#### Data Transfer Objects (DTO)

- **Request DTO**: `None`

- **Response DTO**: `CharacterResponseDto[]`
  - `id` (`string`): Character UUID.
  - `name` (`string`): Character name.
  - `voiceId` (`string`): Fish.audio voice ID assigned to the character.
  - `source` (`string`): Character origin source.
  - `isActive` (`boolean`): Active status flag.
  - `createdAt` (`string`): ISO timestamp of creation.
  - `updatedAt` (`string`): ISO timestamp of last update.

---

### 2. Create Character

- **Endpoint**: `POST /api/v1/characters`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Creates a new AI character entry with a specified name, voice ID, and source.

#### Data Transfer Objects (DTO)

- **Request DTO**: `CreateCharacterDto`
  - `name` (`string`, required): Character name.
  - `voiceId` (`string`, required): Fish.audio voice ID.
  - `source` (`string`, required): Origin source (e.g., Anime, Game, Original).
  - `isActive` (`boolean`, optional): Whether to immediately activate the character. Default is false.

- **Response DTO**: `CharacterResponseDto`
  - `id` (`string`): Character UUID.
  - `name` (`string`): Character name.
  - `voiceId` (`string`): Voice ID.
  - `source` (`string`): Character origin.
  - `isActive` (`boolean`): Active status.
  - `createdAt` (`string`): ISO timestamp of creation.
  - `updatedAt` (`string`): ISO timestamp of last update.

---

### 3. Update Character

- **Endpoint**: `PUT /api/v1/characters/:id`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Updates information for an existing AI character, including name, voice ID, source, or active status.

#### Data Transfer Objects (DTO)

- **Request DTO**: `UpdateCharacterDto`
  - `id` (`string`, path param, required): Character UUID.
  - `name` (`string`, optional): Updated character name.
  - `voiceId` (`string`, optional): Updated voice ID.
  - `source` (`string`, optional): Updated source.
  - `isActive` (`boolean`, optional): Updated active status.

- **Response DTO**: `CharacterResponseDto`
  - `id` (`string`): Character UUID.
  - `name` (`string`): Character name.
  - `voiceId` (`string`): Voice ID.
  - `source` (`string`): Character origin.
  - `isActive` (`boolean`): Active status.
  - `createdAt` (`string`): ISO timestamp.
  - `updatedAt` (`string`): ISO timestamp.

---

### 4. Delete Character

- **Endpoint**: `DELETE /api/v1/characters/:id`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Permanently deletes an AI character and cascades deletion to all associated persona records.

#### Data Transfer Objects (DTO)

- **Request DTO**: `DeleteCharacterParamsDto`
  - `id` (`string`, path param, required): Character UUID.

- **Response DTO**: `DeleteCharacterResponseDto`
  - `success` (`boolean`): Operation success status.
  - `message` (`string`): Result confirmation message.

---

### 5. Get Personas for Character

- **Endpoint**: `GET /api/v1/characters/:id/personas`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Retrieves all configured persona attributes (prompt, tone, identity, etc.) for a specific AI character.

#### Data Transfer Objects (DTO)

- **Request DTO**: `GetPersonasParamsDto`
  - `id` (`string`, path param, required): Character UUID.

- **Response DTO**: `PersonaResponseDto[]`
  - `id` (`string`): Persona UUID.
  - `characterId` (`string`): Parent character UUID.
  - `type` (`string`): Persona attribute type (`SYSTEM_PROMPT`, `TONE`, `IDENTITY`, `KNOWLEDGE_BACKGROUND`, `RELATIONSHIP_DYNAMICS`, `OTHER`).
  - `value` (`string`): Detailed prompt content or context value.
  - `createdAt` (`string`): ISO timestamp.
  - `updatedAt` (`string`): ISO timestamp.

---

### 6. Add Persona to Character

- **Endpoint**: `POST /api/v1/characters/:id/personas`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Adds a new persona attribute configuration (`type` and `value`) to a target AI character.

#### Data Transfer Objects (DTO)

- **Request DTO**: `CreatePersonaDto`
  - `id` (`string`, path param, required): Target character UUID.
  - `type` (`string`, required, enum: `['SYSTEM_PROMPT', 'TONE', 'IDENTITY', 'KNOWLEDGE_BACKGROUND', 'RELATIONSHIP_DYNAMICS', 'OTHER']`): Persona attribute category.
  - `value` (`string`, required): Prompt context content.

- **Response DTO**: `PersonaResponseDto`
  - `id` (`string`): Created persona UUID.
  - `characterId` (`string`): Associated character UUID.
  - `type` (`string`, enum: `['SYSTEM_PROMPT', 'TONE', 'IDENTITY', 'KNOWLEDGE_BACKGROUND', 'RELATIONSHIP_DYNAMICS', 'OTHER']`): Persona attribute category.
  - `value` (`string`): Persona content value.
  - `createdAt` (`string`): ISO timestamp.
  - `updatedAt` (`string`): ISO timestamp.

---

### 7. Update Persona

- **Endpoint**: `PUT /api/v1/characters/:id/personas/:personaId`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Updates a specific persona attribute configuration for a character.

#### Data Transfer Objects (DTO)

- **Request DTO**: `UpdatePersonaDto`
  - `id` (`string`, path param, required): Character UUID.
  - `personaId` (`string`, path param, required): Persona UUID.
  - `type` (`string`, optional, enum: `['SYSTEM_PROMPT', 'TONE', 'IDENTITY', 'KNOWLEDGE_BACKGROUND', 'RELATIONSHIP_DYNAMICS', 'OTHER']`): Updated persona attribute category.
  - `value` (`string`, optional): Updated prompt context content.

- **Response DTO**: `PersonaResponseDto`
  - `id` (`string`): Persona UUID.
  - `characterId` (`string`): Associated character UUID.
  - `type` (`string`, enum: `['SYSTEM_PROMPT', 'TONE', 'IDENTITY', 'KNOWLEDGE_BACKGROUND', 'RELATIONSHIP_DYNAMICS', 'OTHER']`): Persona attribute category.
  - `value` (`string`): Persona content value.
  - `createdAt` (`string`): ISO timestamp.
  - `updatedAt` (`string`): ISO timestamp.

---

### 8. Delete Persona

- **Endpoint**: `DELETE /api/v1/characters/:id/personas/:personaId`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Deletes a specific persona attribute configuration from a character.

#### Data Transfer Objects (DTO)

- **Request DTO**: `DeletePersonaParamsDto`
  - `id` (`string`, path param, required): Character UUID.
  - `personaId` (`string`, path param, required): Persona UUID.

- **Response DTO**: `DeletePersonaResponseDto`
  - `success` (`boolean`): Operation success status.
  - `message` (`string`): Result confirmation message.
