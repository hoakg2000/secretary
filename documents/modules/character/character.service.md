# Character & Persona Service

- **General Description**: Handles business logic for AI Character lifecycle management and persona configuration attributes. Ensures single active character integrity when changing character status and validates persona types.
- **Accessed Database Tables**:
  - `characters`
  - `personas`

---

## List of Methods

### 1. getCharacters

- **Task Description**: Fetches all existing AI characters stored in the database along with basic metadata.
- **Accessed Tables**: `characters` (Read)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**: None

- **Output**:
  - `Promise<CharacterResponseDto[]>`: List of all character records.

---

### 2. createCharacter

- **Task Description**: Creates a new AI character entry. If set as active, it automatically deactivates all previously active characters to guarantee only one character is active at a time.
- **Accessed Tables**: `characters` (Read, Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `dto`: `CreateCharacterDto` - Contains `name`, `voiceId`, `source`, and optional `isActive`.

- **Output**:
  - `Promise<CharacterResponseDto>`: Created character entity.

---

### 3. updateCharacter

- **Task Description**: Updates attributes of a specific character by ID. Handles switching the active character status atomically when `isActive` is set to `true`.
- **Accessed Tables**: `characters` (Read, Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `characterId` (`string`): UUID of the character to update.
  - `dto`: `UpdateCharacterDto` - Contains optional fields `name`, `voiceId`, `source`, `isActive`.

- **Output**:
  - `Promise<CharacterResponseDto>`: Updated character record.

---

### 4. deleteCharacter

- **Task Description**: Deletes a character record and all associated persona configurations. Throws NotFoundException if the character does not exist.
- **Accessed Tables**: `characters` (Write), `personas` (Write - Cascade)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `characterId` (`string`): UUID of the character to delete.

- **Output**:
  - `Promise<{ success: boolean; message: string }>`: Confirmation object indicating success status.

---

### 5. getPersonasByCharacterId

- **Task Description**: Retrieves all persona attribute configurations belonging to a specific character ID.
- **Accessed Tables**: `personas` (Read), `characters` (Read verification)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `characterId` (`string`): UUID of the target character.

- **Output**:
  - `Promise<PersonaResponseDto[]>`: Array of persona configuration objects.

---

### 6. addPersona

- **Task Description**: Adds a new persona attribute (`type` + `value`) to a target character after confirming the character exists.
- **Accessed Tables**: `characters` (Read), `personas` (Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `characterId` (`string`): UUID of the character.
  - `dto`: `CreatePersonaDto` - Object containing valid `type` enum and `value` text string.

- **Output**:
  - `Promise<PersonaResponseDto>`: Created persona entity.

---

### 7. updatePersona

- **Task Description**: Updates an existing persona entry's `type` or `value` for a specific character. Validates ownership to ensure persona belongs to the specified `characterId`.
- **Accessed Tables**: `personas` (Read, Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `characterId` (`string`): Character UUID.
  - `personaId` (`string`): Persona UUID.
  - `dto`: `UpdatePersonaDto` - Object containing optional `type` and `value`.

- **Output**:
  - `Promise<PersonaResponseDto>`: Updated persona entity.

---

### 8. deletePersona

- **Task Description**: Deletes a specific persona attribute associated with a character after verifying existence and ownership.
- **Accessed Tables**: `personas` (Read, Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `characterId` (`string`): Character UUID.
  - `personaId` (`string`): Persona UUID.

- **Output**:
  - `Promise<{ success: boolean; message: string }>`: Confirmation of persona deletion.
