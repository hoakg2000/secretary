"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { enUS, vi } from "date-fns/locale";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useRouter } from "@/i18n/navigation";
import { deleteSession, renameSession } from "@/lib/api/endpoints/chat";
import type { ChatSession } from "@/lib/api/types";
import { messagesKey, SESSIONS_KEY, useSessionsInfinite } from "@/lib/chat/queries";
import { cn } from "@/lib/utils";
import { NewChatDialog } from "./character-picker";
import { errorMessage } from "./error-message";

function SessionRow({
  session,
  active,
  onNavigate,
  onDelete,
}: {
  session: ChatSession;
  active: boolean;
  onNavigate?: () => void;
  onDelete: (s: ChatSession) => void;
}) {
  const t = useTranslations("chat");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const rename = useMutation({
    mutationFn: (title: string) => renameSession(session.id, title),
    onSuccess: () => {
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
    },
    onError: (e) => toast.error(errorMessage(e, t("renameError"))),
  });

  const title = session.title ?? t("untitled");
  const valid = draft.trim().length >= 1 && draft.trim().length <= 120;

  const submit = () => {
    if (rename.isPending) return;
    if (!valid) return;
    if (draft.trim() === session.title) return setEditing(false);
    rename.mutate(draft.trim());
  };

  if (editing)
    return (
      <div className="px-2 py-1">
        <Input
          autoFocus
          value={draft}
          maxLength={120}
          aria-label={t("renameLabel")}
          aria-invalid={!valid}
          disabled={rename.isPending}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => !rename.isPending && setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") setEditing(false);
          }}
        />
      </div>
    );

  return (
    <div
      className={cn(
        "group relative flex items-center rounded-lg hover:bg-muted focus-within:bg-muted",
        active && "bg-muted",
      )}
    >
      <Link
        href={`/chat/${session.id}`}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className="min-w-0 flex-1 rounded-lg px-3 py-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className={cn("block truncate text-sm", active && "font-medium")}>{title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {session.character?.name ? `${session.character.name} · ` : ""}
          {formatDistanceToNow(new Date(session.lastMessageAt), { addSuffix: true, locale: locale === "vi" ? vi : enUS })}
        </span>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="mr-1 shrink-0 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100 data-popup-open:opacity-100"
              aria-label={t("sessionActions", { title })}
            />
          }
        >
          <MoreHorizontal aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => {
              setDraft(session.title ?? "");
              setEditing(true);
            }}
          >
            <Pencil aria-hidden />
            {t("rename")}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => onDelete(session)}>
            <Trash2 aria-hidden />
            {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function SessionList({ activeId, onNavigate }: { activeId?: string; onNavigate?: () => void }) {
  const t = useTranslations("chat");
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useSessionsInfinite();
  const [newOpen, setNewOpen] = useState(false);
  const [toDelete, setToDelete] = useState<ChatSession | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !isFetchingNextPage) void fetchNextPage();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const remove = useMutation({
    mutationFn: (s: ChatSession) => deleteSession(s.id),
    onSuccess: (_, s) => {
      setToDelete(null);
      queryClient.removeQueries({ queryKey: messagesKey(s.id) });
      void queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
      if (s.id === activeId) router.push("/chat");
    },
    onError: (e) => toast.error(errorMessage(e, t("deleteError"))),
  });

  const sessions = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-2">
        <Button variant="outline" className="w-full justify-start" onClick={() => setNewOpen(true)}>
          <Plus aria-hidden />
          {t("newChat")}
        </Button>
      </div>
      <nav aria-label={t("sessions")} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {query.isPending && (
          <div className="flex flex-col gap-2" aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        )}
        {query.isError && (
          <div role="alert" className="flex flex-col items-start gap-2 p-2 text-sm text-destructive">
            {errorMessage(query.error, t("sessionsError"))}
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              {t("retry")}
            </Button>
          </div>
        )}
        {query.isSuccess && !sessions.length && (
          <p className="p-2 text-sm text-muted-foreground">{t("noSessions")}</p>
        )}
        {sessions.map((s) => (
          <SessionRow key={s.id} session={s} active={s.id === activeId} onNavigate={onNavigate} onDelete={setToDelete} />
        ))}
        {hasNextPage && <div ref={sentinel} className="h-6" aria-hidden />}
        {isFetchingNextPage && <Skeleton className="mt-2 h-11" />}
      </nav>

      <NewChatDialog open={newOpen} onOpenChange={setNewOpen} />

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && !remove.isPending && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDescription", { title: toDelete?.title ?? t("untitled") })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => toDelete && remove.mutate(toDelete)}
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
