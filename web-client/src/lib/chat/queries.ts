import { useInfiniteQuery } from "@tanstack/react-query";
import { listMessages, listSessions } from "@/lib/api/endpoints/chat";
import type { ChatMessage, ChatSession, Paginated } from "@/lib/api/types";
import { lastPageNumber } from "./helpers";

export const SESSIONS_KEY = ["chat", "sessions"] as const;
export const messagesKey = (sessionId: string) => ["chat", "messages", sessionId] as const;
export const CHARACTERS_KEY = ["characters"] as const;

const SESSION_PAGE_SIZE = 20;
const MESSAGE_PAGE_SIZE = 30;

export function useSessionsInfinite() {
  return useInfiniteQuery({
    queryKey: SESSIONS_KEY,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => listSessions({ page: pageParam, pageSize: SESSION_PAGE_SIZE }),
    getNextPageParam: (last: Paginated<ChatSession>) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
  });
}

/**
 * Loads the newest page first. pageParam null = "the last page, found at fetch time" so a refetch
 * still lands on the end after new messages. A short last page also pulls the one before it.
 */
export function useMessagesInfinite(sessionId: string | undefined) {
  return useInfiniteQuery({
    queryKey: messagesKey(sessionId ?? ""),
    enabled: !!sessionId,
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }): Promise<Paginated<ChatMessage>> => {
      const id = sessionId!;
      if (pageParam !== null) return listMessages(id, { page: pageParam, pageSize: MESSAGE_PAGE_SIZE });
      const first = await listMessages(id, { page: 1, pageSize: MESSAGE_PAGE_SIZE });
      const last = lastPageNumber(first.total, MESSAGE_PAGE_SIZE);
      if (last === 1) return first;
      const tail = await listMessages(id, { page: last, pageSize: MESSAGE_PAGE_SIZE });
      if (tail.items.length >= MESSAGE_PAGE_SIZE / 2) return tail;
      const prev = await listMessages(id, { page: last - 1, pageSize: MESSAGE_PAGE_SIZE });
      return { ...tail, page: last - 1, items: [...prev.items, ...tail.items] };
    },
    getNextPageParam: (last) => (last.page > 1 ? last.page - 1 : undefined),
  });
}
