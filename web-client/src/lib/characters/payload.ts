import type { CharacterPatch } from "@/lib/api/endpoints/characters";
import type { Character, CharacterInput } from "@/lib/api/types";

export interface CharacterFormValues {
  name: string;
  voiceId: string;
  source: string;
  memoryRule: string;
  systemPrompt: string;
}

const OPTIONAL = ["voiceId", "source", "memoryRule", "systemPrompt"] as const;

export const emptyCharacterForm = (c?: Character): CharacterFormValues => ({
  name: c?.name ?? "",
  voiceId: c?.voiceId ?? "",
  source: c?.source ?? "",
  memoryRule: c?.memoryRule ?? "",
  systemPrompt: c?.systemPrompt ?? "",
});

/** Create: empty optional fields are left out. */
export function toCreateInput(v: CharacterFormValues): CharacterInput {
  const input: CharacterInput = { name: v.name.trim() };
  for (const k of OPTIONAL) if (v[k].trim()) input[k] = v[k].trim();
  return input;
}

/** Edit: an emptied field that had a value becomes `null` (server clears it); untouched empties are left out. */
export function toPatch(v: CharacterFormValues, original: Character): CharacterPatch {
  const patch: CharacterPatch = { name: v.name.trim() };
  for (const k of OPTIONAL) {
    const next = v[k].trim();
    if (next) patch[k] = next;
    else if (original[k] !== null) patch[k] = null;
  }
  return patch;
}
