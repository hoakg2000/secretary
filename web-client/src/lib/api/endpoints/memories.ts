import { apiFetch } from "../client";
import type {
  Id,
  ListMemoryQuery,
  Memory,
  MemorySearchResult,
  Paginated,
  SaveMemoryInput,
  SearchMemoryInput,
  UpdateMemoryInput,
} from "../types";

export const listMemories = (query?: ListMemoryQuery) =>
  apiFetch<Paginated<Memory>>("/ai-agent/memories", { query });
export const saveMemory = (input: SaveMemoryInput) =>
  apiFetch<Memory>("/ai-agent/memories", { method: "POST", json: input });
export const updateMemory = (id: Id, input: UpdateMemoryInput) =>
  apiFetch<Memory>(`/ai-agent/memories/${id}`, { method: "PATCH", json: input });
export const deleteMemory = (id: Id) => apiFetch<null>(`/ai-agent/memories/${id}`, { method: "DELETE" });
export const searchMemories = (input: SearchMemoryInput) =>
  apiFetch<MemorySearchResult[]>("/ai-agent/memories/search", { method: "POST", json: input });
