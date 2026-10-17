# Character Service

- **Class**: `CharacterService` — `server/src/character/character.service.ts`
- **Description**: characters and personas. A character is the AI's identity; its personas are joined into the chat
  system instruction by `AgentService`. There can be many characters; the client chooses one per chat session.
- **Tables**: `characters`, `personas` (read, write). Read elsewhere: `AgentService` (persona, `memory_rule`),
  `TtsService` through `ChatSessionService.findOwnMessage` (`voice_id`).
- **No AI tool** in this service.

---

## Methods

### 1. createCharacter(dto)

- Creates the row from `dto`. Returns the character with `personas`.
- **Tables**: `characters` (create).

### 2. findAllCharacters()

- All characters with `personas`, newest `created_at` first.

### 3. findCharacterById(id)

- Character with `personas`; `NotFoundException` when missing. Used by methods 4, 5 and 6 as the existence check (method 7 uses `findPersona`).

### 4. updateCharacter(id, dto)

- Existence check, then update the row. `dto` is written as given, including `memoryRule`.

### 5. removeCharacter(id)

- Existence check, then delete. `personas` cascade; `chat_sessions.character_id` is set null by the database.

### 6. addPersona(characterId, dto)

- Existence check of the character, then create the persona (`type`, `value`).

### 7. updatePersona(characterId, personaId, dto) / removePersona(characterId, personaId)

- Private `findPersona` looks up `id = personaId AND character_id = characterId`; `NotFoundException` otherwise, so a
  persona cannot be changed through another character's URL. Then update or delete.
