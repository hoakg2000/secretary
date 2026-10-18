import { describe, expect, it } from "vitest";
import type { Character } from "@/lib/api/types";
import { toCreateInput, toPatch } from "./payload";

const base: Character = {
  id: "1",
  name: "Mari",
  voiceId: "v1",
  source: null,
  memoryRule: null,
  slug: null,
  systemPrompt: "hi",
  createdAt: "",
  updatedAt: "",
};
const form = { name: " Mari ", voiceId: "", source: "", memoryRule: "", systemPrompt: "hi" };

describe("character payloads", () => {
  it("create drops empty optional fields", () => {
    expect(toCreateInput(form)).toEqual({ name: "Mari", systemPrompt: "hi" });
  });
  it("patch sends null only for emptied fields that had a value", () => {
    expect(toPatch(form, base)).toEqual({ name: "Mari", voiceId: null, systemPrompt: "hi" });
  });
});
