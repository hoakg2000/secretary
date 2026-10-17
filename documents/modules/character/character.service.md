# Character Service

- **Class**: `CharacterService` — `server/src/character/character.service.ts`
- **Description**: characters. A character is the AI's identity; its `system_prompt` is added to the chat
  system instruction by `AgentService` (`buildCharacterPrompt`). There can be many characters; the client chooses one per chat session.
- **Tables**: `characters` (read, write). Read elsewhere: `AgentService` (`system_prompt`, `memory_rule`),
  `TtsService` through `ChatSessionService.findOwnMessage` (`voice_id`).
- **No AI tool** in this service.

---

## Methods

### 1. createCharacter(dto)

- Creates the row from `dto`. Returns the character.
- **Tables**: `characters` (create).

### 2. findAllCharacters()

- All characters, newest `created_at` first.

### 3. findCharacterById(id)

- Character; `NotFoundException` when missing. Used by methods 4 and 5 as the existence check.

### 4. updateCharacter(id, dto)

- Existence check, then update the row. `dto` is written as given, including `memoryRule` and `systemPrompt`.

### 5. removeCharacter(id)

- Existence check, then delete. `chat_sessions.character_id` is set null by the database.

---

## Prompt composition

`buildCharacterPrompt(character)` in `server/src/character/character-prompt.ts` returns the character block of the chat system instruction: `## Nhân vật bạn đang nhập vai`, then `Tên: <name>` with `(Nguồn: <source>)` when set, then `system_prompt`. It returns an empty string when there is no character or `system_prompt` is blank. The rest of the instruction is built in `AgentService` (see `modules/ai/ai.service.md`).

## Character JSON

`npm run seed` loads every `documents/characters/*.json` (`server/prisma/seed-characters.ts`, `seedCharacters`). It upserts by `slug` and sets `name`, `source`, `voiceId`, `memoryRule` and `systemPrompt`. A file without `slug`, `name` or an object `profile`, or with invalid JSON, stops the seed with an error naming the file. The JSON is the source of truth: re-seeding overwrites changes made through the API to that character.

| Field | Content |
|-------|---------|
| `slug` | Required. Unique key of the character. |
| `name` | Required. |
| `source` | Optional. Origin of the character. |
| `voiceId` | Optional. Fish.audio voice. |
| `memoryRule` | Optional. Same meaning as `characters.memory_rule`. |
| `profile` | Required. Structured prompt, rendered into `system_prompt` by `renderCharacterPrompt`: `identity` (key-value pairs), `personality` (groups of bullet lists), `relationships` (`name`, `role`, `dynamic`), `background` and `world` (lists), `speakingStyle` (`tone`, `patterns`, `japanese` with `firstPerson`, `addressUser`, `register`), `sampleDialogues` (`context`, `line`), `rules` (`do`, `dont`). Empty parts are skipped. |
| `sources` | Optional. Research notes. Never rendered and never sent to the model. |

Example: `documents/characters/iochi_mari.json`.
