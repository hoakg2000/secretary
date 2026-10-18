"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, MessageSquare, PanelLeft } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { usePathname } from "@/i18n/navigation";
import { ApiError } from "@/lib/api/client";
import { CALENDAR_KEY } from "@/lib/calendar/keys";
import { FINANCE_KEY } from "@/lib/finance/keys";
import { MEMORIES_KEY } from "@/lib/memories/keys";
import { confirmAction, discardAction, streamChat } from "@/lib/api/endpoints/chat";
import type { Character, ChatMessage } from "@/lib/api/types";
import { mergeMessagePages, parseToolCalls } from "@/lib/chat/helpers";
import { applyFrame, newTurn, type LiveTurn, type PendingAction } from "@/lib/chat/live";
import { messagesKey, SESSIONS_KEY, useMessagesInfinite, useSessionsInfinite } from "@/lib/chat/queries";
import { useTtsPlayer } from "@/lib/chat/use-tts-player";
import { CharacterCards } from "./character-picker";
import { Composer } from "./composer";
import { ConfirmationCard } from "./confirmation-card";
import { errorMessage } from "./error-message";
import { ModelBubble, UserBubble, type ToolChipData, type TtsProps } from "./message-bubble";
import { SessionList } from "./session-list";

const STICK_THRESHOLD = 100;

function storedChips(m: ChatMessage): ToolChipData[] {
  return parseToolCalls(m.toolCalls).map((c) => ({ tool: c.tool, args: c.args, result: c.result, error: c.error }));
}

export function ChatView() {
  const t = useTranslations("chat");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const pathname = usePathname(); // "/chat" or "/chat/<id>"
  const pathId = pathname.split("/")[2] as string | undefined;

  const [listOpen, setListOpen] = useState(false);
  const [chosen, setChosen] = useState<Character | null>(null);
  const [live, setLive] = useState<LiveTurn[]>([]);
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [streaming, setStreaming] = useState(false);

  // The stream may create the session; the URL is updated in place, so this ref is the source until pathname follows.
  const sessionRef = useRef<string | undefined>(pathId);
  const abortRef = useRef<AbortController | null>(null);
  const counter = useRef(0);
  const noRetry = useRef(new Set<string>()); // turns whose user text the server already stored
  useEffect(() => {
    // navigated elsewhere (not the session this stream just created): drop the old conversation state
    if (pathId !== sessionRef.current) {
      abortRef.current?.abort();
      setLive([]);
      setActions([]);
      setChosen(null);
    }
    sessionRef.current = pathId;
  }, [pathId]);
  useEffect(() => () => abortRef.current?.abort(), []);

  // ----- session + character -----
  const sessionsQ = useSessionsInfinite();
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = sessionsQ;
  const session = useMemo(
    () => (pathId ? sessionsQ.data?.pages.flatMap((p) => p.items).find((s) => s.id === pathId) : undefined),
    [pathId, sessionsQ.data],
  );
  useEffect(() => {
    // the active session can sit beyond the first page of the list
    if (pathId && !session && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [pathId, session, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const character = session?.character ?? chosen;
  const characterName = character?.name ?? t("assistant");

  // ----- messages -----
  const messagesQ = useMessagesInfinite(pathId);
  const messages = useMemo(() => (messagesQ.data ? mergeMessagePages(messagesQ.data.pages) : []), [messagesQ.data]);

  // ----- scrolling -----
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const anchorRef = useRef<number | null>(null); // scrollHeight before older messages were prepended
  const firstId = messages[0]?.id;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || anchorRef.current === null) return;
    el.scrollTop += el.scrollHeight - anchorRef.current;
    anchorRef.current = null;
  }, [firstId]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current && anchorRef.current === null) el.scrollTop = el.scrollHeight;
  }, [messages.length, live, actions, messagesQ.isPending]);

  const loadOlder = async () => {
    anchorRef.current = scrollRef.current?.scrollHeight ?? null;
    const res = await messagesQ.fetchNextPage();
    if (res.isError) anchorRef.current = null;
  };

  // ----- TTS -----
  const tts = useTtsPlayer(t("ttsError"));
  const ttsFor = (messageId: string | undefined, contentJp: string | null | undefined): TtsProps | undefined => {
    if (!messageId) return undefined;
    const disabledReason = !contentJp?.trim() ? t("ttsNoJp") : !character?.voiceId ? t("ttsNoVoice") : null;
    return { disabledReason, state: tts.stateOf(messageId), onToggle: () => void tts.toggle(messageId) };
  };

  // ----- streaming -----
  /** Resolves false only when the request was rejected before the stream opened (the text should be kept). */
  const send = async (text: string, replaceKey?: string): Promise<boolean> => {
    const characterId = character?.id ?? chosen?.id;
    if (!sessionRef.current && !characterId) return false;

    const key = `t${++counter.current}`;
    const ac = new AbortController();
    abortRef.current = ac;
    stickRef.current = true;
    setLive((l) => [...(replaceKey ? l.filter((x) => x.key !== replaceKey) : l), newTurn(key, text)]);
    setStreaming(true);
    const update = (fn: (turn: LiveTurn) => LiveTurn) => setLive((l) => l.map((x) => (x.key === key ? fn(x) : x)));

    let opened = false;
    let failed = false;
    try {
      const frames = await streamChat(
        sessionRef.current ? { message: text, sessionId: sessionRef.current } : { message: text, characterId },
        ac.signal,
      );
      opened = true;
      for await (const frame of frames) {
        if (frame.type === "session") {
          if (!sessionRef.current) {
            sessionRef.current = frame.sessionId;
            // replaceState keeps this component (and the running stream) mounted; Next syncs usePathname
            window.history.replaceState(null, "", `/${locale}/chat/${frame.sessionId}`);
            void queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
          }
        } else if (frame.type === "confirmation_required") {
          setActions((a) => [
            ...a,
            { actionId: frame.actionId, tool: frame.tool, args: frame.args, receivedAt: Date.now(), state: "pending" },
          ]);
        } else if (frame.type === "done") {
          break;
        } else {
          if (frame.type === "error") {
            failed = true;
            noRetry.current.add(key);
          }
          update((x) => applyFrame(x, frame));
        }
      }
      if (!failed) update((x) => (x.status === "streaming" ? { ...x, status: "done" } : x));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        update((x) => ({ ...x, status: "stopped" }));
        return true;
      }
      failed = true;
      if (!opened && error instanceof ApiError && error.status >= 400 && error.status < 500) {
        toast.error(error.message);
        setLive((l) => l.filter((x) => x.key !== key));
        return false;
      }
      if (opened) noRetry.current.add(key);
      update((x) => ({ ...x, status: "error", error: errorMessage(error, t("streamError")) }));
    } finally {
      if (abortRef.current === ac) {
        abortRef.current = null;
        setStreaming(false);
      }
    }

    if (failed) return true; // the error bubble stays
    const id = sessionRef.current;
    void queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
    if (id) {
      // reset (not invalidate): page boundaries moved, so start again from the newest page
      await queryClient.resetQueries({ queryKey: messagesKey(id) });
    }
    // drop only this send's turn; another turn may still be streaming
    setLive((l) => l.filter((x) => x.key !== key || x.status === "error"));
    return true;
  };

  const stop = () => abortRef.current?.abort();

  const patchAction = (actionId: string, patch: Partial<PendingAction>) =>
    setActions((a) => a.map((x) => (x.actionId === actionId ? { ...x, ...patch } : x)));

  const onConfirm = async (a: PendingAction) => {
    patchAction(a.actionId, { state: "confirming" });
    try {
      const res = await confirmAction(a.actionId);
      patchAction(a.actionId, { state: "confirmed", result: res.result });
      // the confirmed tool may have written to any of these
      for (const queryKey of [CALENDAR_KEY, FINANCE_KEY, MEMORIES_KEY]) void queryClient.invalidateQueries({ queryKey });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) patchAction(a.actionId, { state: "expired" });
      else patchAction(a.actionId, { state: "failed", result: errorMessage(error, t("confirmError")) });
    }
  };

  const onDiscard = async (a: PendingAction) => {
    patchAction(a.actionId, { state: "confirming" });
    try {
      await discardAction(a.actionId);
      patchAction(a.actionId, { state: "discarded" });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) patchAction(a.actionId, { state: "expired" });
      else patchAction(a.actionId, { state: "failed", result: errorMessage(error, t("confirmError")) });
    }
  };

  const onExpire = useCallback(
    (actionId: string) => setActions((a) => a.map((x) => (x.actionId === actionId ? { ...x, state: "expired" } : x))),
    [],
  );

  // ----- render -----
  const isNewChat = !pathId;
  const showEmpty = isNewChat && !live.length;
  const title = session ? (session.title ?? t("untitled")) : t("newChat");

  return (
    <div className="-m-4 flex h-[calc(100dvh-3.2rem)] md:-m-6 md:h-dvh">
      <aside className="hidden w-72 shrink-0 border-r md:block">
        <SessionList activeId={pathId} />
      </aside>

      <Sheet open={listOpen} onOpenChange={setListOpen}>
        <SheetContent side="left" className="w-80 p-0 md:hidden">
          <SheetTitle className="sr-only">{t("sessions")}</SheetTitle>
          <SheetDescription className="sr-only">{t("sessions")}</SheetDescription>
          <SessionList activeId={pathId} onNavigate={() => setListOpen(false)} />
        </SheetContent>
      </Sheet>

      <section className="flex min-w-0 flex-1 flex-col" aria-label={t("conversation")}>
        <header className="flex items-center gap-2 border-b px-3 py-2">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={t("openSessions")}
            onClick={() => setListOpen(true)}
          >
            <PanelLeft aria-hidden />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{title}</h1>
            {character && <p className="truncate text-xs text-muted-foreground">{character.name}</p>}
          </div>
        </header>

        <div
          ref={scrollRef}
          role="log"
          aria-busy={streaming}
          aria-label={t("messages")}
          className="min-h-0 flex-1 overflow-y-auto"
          onScroll={(e) => {
            const el = e.currentTarget;
            stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD;
          }}
        >
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
            {showEmpty && (
              <div className="flex flex-col items-center gap-4 py-10 text-center">
                <MessageSquare className="size-10 text-muted-foreground" aria-hidden />
                <h2 className="text-xl font-semibold">{t("emptyTitle")}</h2>
                <p className="text-sm text-muted-foreground">{t("emptyHint")}</p>
                <div className="w-full max-w-xl text-left">
                  <CharacterCards selectedId={chosen?.id ?? null} onSelect={setChosen} />
                </div>
              </div>
            )}

            {pathId && messagesQ.isPending && (
              <div className="flex flex-col gap-4" aria-busy="true">
                <Skeleton className="ml-auto h-10 w-1/2" />
                <Skeleton className="h-20 w-3/4" />
                <Skeleton className="ml-auto h-10 w-1/3" />
              </div>
            )}
            {pathId && messagesQ.isError && (
              <div role="alert" className="flex flex-col items-center gap-2 text-sm text-destructive">
                <AlertCircle className="size-5" aria-hidden />
                {errorMessage(messagesQ.error, t("messagesError"))}
                <Button variant="outline" size="sm" onClick={() => void messagesQ.refetch()}>
                  {t("retry")}
                </Button>
              </div>
            )}
            {pathId && messagesQ.isSuccess && !messages.length && !live.length && (
              <p className="py-10 text-center text-sm text-muted-foreground">{t("emptySession")}</p>
            )}

            {messagesQ.hasNextPage && (
              <div className="flex justify-center">
                <Button variant="outline" size="sm" disabled={messagesQ.isFetchingNextPage} onClick={() => void loadOlder()}>
                  {messagesQ.isFetchingNextPage ? t("loadingOlder") : t("loadOlder")}
                </Button>
              </div>
            )}

            {messages.map((m) =>
              m.role === "USER" ? (
                <UserBubble key={m.id}>{m.content}</UserBubble>
              ) : (
                <ModelBubble
                  key={m.id}
                  characterName={characterName}
                  content={m.content}
                  contentJp={m.contentJp}
                  chips={storedChips(m)}
                  tts={ttsFor(m.id, m.contentJp)}
                />
              ),
            )}

            {live.map((turn) => (
              <div key={turn.key} className="flex flex-col gap-5">
                <UserBubble>{turn.userText}</UserBubble>
                <ModelBubble
                  characterName={characterName}
                  content={turn.text}
                  contentJp={turn.contentJp}
                  chips={turn.steps.map((s) => ({
                    tool: s.tool,
                    args: s.args,
                    result: s.result,
                    running: !s.hasResult && turn.status === "streaming",
                  }))}
                  streaming={turn.status === "streaming"}
                  stopped={turn.status === "stopped"}
                  error={turn.status === "error" ? (turn.error ?? t("streamError")) : undefined}
                  onRetry={turn.status === "error" && !streaming && !noRetry.current.has(turn.key) ? () => void send(turn.userText, turn.key) : undefined}
                  tts={ttsFor(turn.messageId, turn.contentJp)}
                />
              </div>
            ))}

            {actions.map((a) => (
              <ConfirmationCard
                key={a.actionId}
                action={a}
                onConfirm={() => void onConfirm(a)}
                onDiscard={() => void onDiscard(a)}
                onExpire={() => onExpire(a.actionId)}
              />
            ))}
          </div>
        </div>

        <div className="border-t p-3">
          {isNewChat && !chosen && <p className="mb-2 text-center text-xs text-muted-foreground">{t("chooseToType")}</p>}
          <Composer streaming={streaming} disabled={isNewChat && !chosen && !live.length} onSend={(text) => send(text)} onStop={stop} />
        </div>
      </section>
    </div>
  );
}
