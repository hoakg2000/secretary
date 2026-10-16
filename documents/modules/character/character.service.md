# Character Service

- **Class**: `CharacterService` — `server/src/character/character.service.ts`
- **Description**: characters and personas. A character is the AI's identity; its personas are joined into the chat
  system instruction by `AgentService`. Exactly one character may be active.
- **Tables**: `characters`, `personas` (read, write). Read elsewhere: `AgentService` (persona, `memory_rule`),
  `TtsService` (`voice_id`).
- **No AI tool** in this service.

Status tags: `[Implemented]` = in the code today. `[Planned]` = designed, not built.

## Change log

| Date | Change |
|------|--------|
| 2026-10-16 | Rewritten from the code. Single-active rule is enforced by the partial unique index `characters_single_active` plus a deactivate-then-write transaction. Added `setActiveCharacter` and the persona ownership check. `memory_rule` is stored as given. |

---

## Methods

### 1. createCharacter(dto) `[Implemented]`

- One transaction: when `dto.isActive`, set `is_active = false` on every active character; then create the row.
- Returns the character with `personas`.
- **Tables**: `characters` (update, create).

### 2. findAllCharacters() `[Implemented]`

- All characters with `personas`, newest `created_at` first.

### 3. findCharacterById(id) `[Implemented]`

- Character with `personas`; `NotFoundException` when missing. Used by every method below as the existence check.

### 4. updateCharacter(id, dto) `[Implemented]`

- Existence check, then one transaction: when `dto.isActive`, deactivate the other active characters; update the row.
  `dto` is written as given, including `memoryRule`.

### 5. removeCharacter(id) `[Implemented]`

- Existence check, then delete. `personas` cascade; `chat_sessions.character_id` is set null by the database.

### 6. setActiveCharacter(id) `[Implemented]`

- Existence check, then one transaction: deactivate the others, activate this one. Returns it with `personas`.

### 7. addPersona(characterId, dto) `[Implemented]`

- Existence check of the character, then create the persona (`type`, `value`).

### 8. updatePersona(characterId, personaId, dto) / removePersona(characterId, personaId) `[Implemented]`

- Private `findPersona` looks up `id = personaId AND character_id = characterId`; `NotFoundException` otherwise, so a
  persona cannot be changed through another character's URL. Then update or delete.
