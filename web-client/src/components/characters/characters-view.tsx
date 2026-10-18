"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageCircle, Pencil, Plus, Trash2, Volume2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { CharacterAvatar } from "@/components/chat/character-picker";
import { errorMessage } from "@/components/chat/error-message";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "@/i18n/navigation";
import { deleteCharacter, listCharacters } from "@/lib/api/endpoints/characters";
import { createSession } from "@/lib/api/endpoints/chat";
import type { Character } from "@/lib/api/types";
import { CHARACTERS_KEY, SESSIONS_KEY } from "@/lib/chat/queries";
import { CharacterSheet } from "./character-sheet";

export function CharactersView() {
  const t = useTranslations("characters");
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: CHARACTERS_KEY, queryFn: listCharacters });
  const [sheet, setSheet] = useState<{ character?: Character } | null>(null);
  const [toDelete, setToDelete] = useState<Character | null>(null);

  const start = useMutation({
    mutationFn: (c: Character) => createSession({ characterId: c.id }),
    onSuccess: (session) => {
      void queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
      router.push(`/chat/${session.id}`);
    },
    onError: (e) => toast.error(errorMessage(e, t("startError"))),
  });

  const remove = useMutation({
    mutationFn: (c: Character) => deleteCharacter(c.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CHARACTERS_KEY });
      void queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
      toast.success(t("deleted"));
      setToDelete(null);
    },
    onError: (e) => toast.error(errorMessage(e, t("deleteError"))),
  });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <Button onClick={() => setSheet({})}>
          <Plus aria-hidden />
          {t("new")}
        </Button>
      </div>

      {query.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : query.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-sm text-destructive">
          {errorMessage(query.error, t("loadError"))}
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t("retry")}
          </Button>
        </div>
      ) : query.data.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {query.data.map((c) => (
            <li key={c.id}>
              <Card className="h-full">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <CharacterAvatar name={c.name} className="size-10" />
                    <div className="min-w-0 flex-1">
                      <CardTitle className="truncate">{c.name}</CardTitle>
                      {c.source && <p className="truncate text-xs text-muted-foreground">{c.source}</p>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-wrap items-start gap-1.5">
                  {c.slug && <Badge variant="secondary">{c.slug}</Badge>}
                  {c.voiceId && (
                    <Badge variant="outline">
                      <Volume2 aria-hidden />
                      {c.voiceId}
                    </Badge>
                  )}
                </CardContent>
                <CardFooter className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => start.mutate(c)} disabled={start.isPending}>
                    {start.isPending && start.variables?.id === c.id ? (
                      <Loader2 className="animate-spin" aria-hidden />
                    ) : (
                      <MessageCircle aria-hidden />
                    )}
                    {t("startChat")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setSheet({ character: c })}>
                    <Pencil aria-hidden />
                    {t("edit")}
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="ml-auto text-destructive"
                    aria-label={t("deleteLabel", { name: c.name })}
                    onClick={() => setToDelete(c)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </CardFooter>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <CharacterSheet
        open={sheet !== null}
        character={sheet?.character}
        onOpenChange={(o) => !o && setSheet(null)}
      />

      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && !remove.isPending && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteDescription", { name: toDelete?.name ?? "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (toDelete) remove.mutate(toDelete);
              }}
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
