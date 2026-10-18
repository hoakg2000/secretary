"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Volume2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "@/i18n/navigation";
import { listCharacters } from "@/lib/api/endpoints/characters";
import { createSession } from "@/lib/api/endpoints/chat";
import type { Character } from "@/lib/api/types";
import { CHARACTERS_KEY, SESSIONS_KEY } from "@/lib/chat/queries";
import { cn } from "@/lib/utils";
import { errorMessage } from "./error-message";

export function CharacterAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary",
        className,
      )}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/** Grid of buttons, one per character, with loading / empty / error states. */
export function CharacterCards({
  selectedId,
  onSelect,
  disabled,
  pendingId,
}: {
  selectedId?: string | null;
  onSelect: (character: Character) => void;
  disabled?: boolean;
  pendingId?: string | null;
}) {
  const t = useTranslations("chat");
  const query = useQuery({ queryKey: CHARACTERS_KEY, queryFn: listCharacters });

  if (query.isPending)
    return (
      <div className="grid gap-2 sm:grid-cols-2" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  if (query.isError)
    return (
      <div role="alert" className="flex flex-col items-start gap-2 text-sm text-destructive">
        {errorMessage(query.error, t("charactersError"))}
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          {t("retry")}
        </Button>
      </div>
    );
  if (!query.data.length) return <p className="text-sm text-muted-foreground">{t("noCharacters")}</p>;

  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {query.data.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            disabled={disabled}
            aria-pressed={selectedId === undefined ? undefined : selectedId === c.id}
            onClick={() => onSelect(c)}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl border p-3 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
              selectedId === c.id && "border-primary bg-muted",
            )}
          >
            <CharacterAvatar name={c.name} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{c.name}</span>
              {c.source && <span className="block truncate text-xs text-muted-foreground">{c.source}</span>}
            </span>
            {pendingId === c.id ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              c.voiceId && <Volume2 className="size-4 text-muted-foreground" aria-label={t("hasVoice")} />
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function NewChatDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("chat");
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: (c: Character) => createSession({ characterId: c.id }),
    onSuccess: (session) => {
      void queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
      onOpenChange(false);
      router.push(`/chat/${session.id}`);
    },
    onError: (e) => toast.error(errorMessage(e, t("createError"))),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("newChat")}</DialogTitle>
          <DialogDescription>{t("pickCharacter")}</DialogDescription>
        </DialogHeader>
        <CharacterCards
          onSelect={(c) => create.mutate(c)}
          disabled={create.isPending}
          pendingId={create.isPending ? create.variables?.id : null}
        />
      </DialogContent>
    </Dialog>
  );
}
