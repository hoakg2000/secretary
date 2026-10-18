import { apiFetch, apiFetchRaw } from "../client";
import type {
  ChatMessage,
  ChatSession,
  ConfirmActionResult,
  CreateSessionInput,
  Id,
  PageQuery,
  Paginated,
  SuccessResult,
} from "../types";

export { streamChat } from "../sse";

export const listSessions = (query?: PageQuery) =>
  apiFetch<Paginated<ChatSession>>("/ai-agent/sessions", { query });
export const createSession = (input: CreateSessionInput) =>
  apiFetch<ChatSession>("/ai-agent/sessions", { method: "POST", json: input });
export const renameSession = (id: Id, title: string) =>
  apiFetch<ChatSession>(`/ai-agent/sessions/${id}`, { method: "PATCH", json: { title } });
export const deleteSession = (id: Id) =>
  apiFetch<SuccessResult>(`/ai-agent/sessions/${id}`, { method: "DELETE" });
/** Oldest first. */
export const listMessages = (sessionId: Id, query?: PageQuery) =>
  apiFetch<Paginated<ChatMessage>>(`/ai-agent/sessions/${sessionId}/messages`, { query });

export const confirmAction = (actionId: string) =>
  apiFetch<ConfirmActionResult>(`/ai-agent/actions/${actionId}/confirm`, { method: "POST" });
export const discardAction = (actionId: string) =>
  apiFetch<SuccessResult>(`/ai-agent/actions/${actionId}`, { method: "DELETE" });

/** MP3 of the message's Japanese text. 503 without a Fish.audio key, 400 without voice/contentJp. */
export const textToSpeech = async (messageId: Id): Promise<Blob> =>
  (await apiFetchRaw("/ai-agent/tts", { method: "POST", json: { messageId } })).blob();
