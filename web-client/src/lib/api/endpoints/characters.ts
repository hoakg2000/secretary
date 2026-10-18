import { apiFetch } from "../client";
import type { Character, CharacterInput, Id } from "../types";

/** PATCH: `null` clears a nullable field (everything but `name`). */
export type CharacterPatch = { name?: string } & { [K in "voiceId" | "source" | "memoryRule" | "systemPrompt"]?: string | null };

export const listCharacters = () => apiFetch<Character[]>("/characters");
export const getCharacter = (id: Id) => apiFetch<Character>(`/characters/${id}`);
export const createCharacter = (input: CharacterInput) =>
  apiFetch<Character>("/characters", { method: "POST", json: input });
export const updateCharacter = (id: Id, input: CharacterPatch) =>
  apiFetch<Character>(`/characters/${id}`, { method: "PATCH", json: input });
export const deleteCharacter = (id: Id) => apiFetch<null>(`/characters/${id}`, { method: "DELETE" });
