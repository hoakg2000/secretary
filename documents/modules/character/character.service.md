# Character & Persona Service

- **General Description**: Manages core business logic for AI Character lifecycle (creation, modification, activation, deletion) and their associated Persona attribute configurations (system prompts, tone, identity, knowledge background, relationship dynamics, etc.).
- **Accessed Database Tables**:
  - `characters`
  - `personas`

---

## List of Methods

### 1. getCharacters

- **Task Description**: Retrieves all registered AI character records from the `characters` table, including their active status and voice metadata.
- **Accessed Tables**: `characters` (Read)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**: None

- **Output**:
  - `Promise<CharacterResponseDto[]>`: Array of character records.

---

### 2. createCharacter

- **Task Description**: Creates a new AI character entry in `characters` with `name`, `voice_id` (Fish.audio), and `source`. Manages single active character state logic if marked active.
- **Accessed Tables**: `characters` (Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `dto`: `CreateCharacterDto` - Character name, voice ID, source origin, and optional active flag.

- **Output**:
  - `Promise<CharacterResponseDto>`: Newly created character entity representation.

---

### 3. updateCharacter

- **Task Description**: Updates AI character details (Name, Voice ID, Source, Active status) by ID. When activating a character, deactivates other characters to maintain a single active persona.
- **Accessed Tables**: `characters` (Read, Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `id` (`string`): Character UUID.
  - `dto`: `UpdateCharacterDto` - Partial update properties for character.

- **Output**:
  - `Promise<CharacterResponseDto>`: Updated character entity representation.

---

### 4. deleteCharacter

- **Task Description**: Permanently deletes an AI character and cascades deletion to all associated persona configurations in `personas`.
- **Accessed Tables**: `characters` (Delete), `personas` (Delete)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `id` (`string`): Character UUID to delete.

- **Output**:
  - `Promise<DeleteCharacterResponseDto>`: Success status and confirmation message.

---

### 5. getPersonasByCharacterId

- **Task Description**: Fetches all persona attribute configurations (Prompt, Tone, Identity, Knowledge Background, Relationship Dynamics, Other) assigned to a given character from `personas`.
- **Accessed Tables**: `characters` (Read), `personas` (Read)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `characterId` (`string`): Parent character UUID.

- **Output**:
  - `Promise<PersonaResponseDto[]>`: Array of persona configurations for the target character.

---

### 6. addPersona

- **Task Description**: Validates character existence and adds a new persona attribute configuration (`type` + `value`) to the target character in `personas`.
- **Accessed Tables**: `characters` (Read), `personas` (Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `characterId` (`string`): Target character UUID.
  - `dto`: `CreatePersonaDto` - DTO containing `type` (enum: `['SYSTEM_PROMPT', 'TONE', 'IDENTITY', 'KNOWLEDGE_BACKGROUND', 'RELATIONSHIP_DYNAMICS', 'OTHER']`) and `value` (prompt content).

- **Output**:
  - `Promise<PersonaResponseDto>`: Newly created persona attribute entity representation.

---

### 7. updatePersona

- **Task Description**: Validates character ownership and updates an existing persona attribute's type or value in `personas`.
- **Accessed Tables**: `personas` (Read, Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `characterId` (`string`): Parent character UUID.
  - `personaId` (`string`): Target persona UUID.
  - `dto`: `UpdatePersonaDto` - DTO containing updated `type` (enum: `['SYSTEM_PROMPT', 'TONE', 'IDENTITY', 'KNOWLEDGE_BACKGROUND', 'RELATIONSHIP_DYNAMICS', 'OTHER']`) and/or `value`.

- **Output**:
  - `Promise<PersonaResponseDto>`: Updated persona attribute entity representation.

---

### 8. deletePersona

- **Task Description**: Validates character ownership and deletes the specific persona attribute configuration from `personas`.
- **Accessed Tables**: `personas` (Delete)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `characterId` (`string`): Parent character UUID.
  - `personaId` (`string`): Target persona UUID.

- **Output**:
  - `Promise<DeletePersonaResponseDto>`: Deletion success confirmation status.
