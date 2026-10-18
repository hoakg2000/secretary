"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { errorMessage } from "@/components/chat/error-message";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { createCharacter, updateCharacter } from "@/lib/api/endpoints/characters";
import type { Character } from "@/lib/api/types";
import { CHARACTERS_KEY, SESSIONS_KEY } from "@/lib/chat/queries";
import { emptyCharacterForm, toCreateInput, toPatch, type CharacterFormValues } from "@/lib/characters/payload";

const MEMORY_MAX = 2000;
const PROMPT_MAX = 20000;

/** Create (character undefined) or edit form in a right-hand sheet. */
export function CharacterSheet({
  open,
  character,
  onOpenChange,
}: {
  open: boolean;
  character?: Character;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("characters");
  const queryClient = useQueryClient();

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t("nameRequired")),
        voiceId: z.string(),
        source: z.string(),
        memoryRule: z.string().max(MEMORY_MAX, t("tooLong", { max: MEMORY_MAX })),
        systemPrompt: z.string().max(PROMPT_MAX, t("tooLong", { max: PROMPT_MAX })),
      }),
    [t],
  );

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CharacterFormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyCharacterForm(character),
  });

  // Reset whenever the sheet opens for a (different) character.
  useEffect(() => {
    if (open) reset(emptyCharacterForm(character));
  }, [open, character, reset]);

  const save = useMutation({
    mutationFn: (v: CharacterFormValues) =>
      character ? updateCharacter(character.id, toPatch(v, character)) : createCharacter(toCreateInput(v)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CHARACTERS_KEY });
      void queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }); // sessions embed the character
      toast.success(t(character ? "saved" : "created"));
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e, t("saveError"))),
  });

  const memoryLen = (useWatch({ control, name: "memoryRule" }) ?? "").length;
  const promptLen = (useWatch({ control, name: "systemPrompt" }) ?? "").length;
  const err = (k: keyof CharacterFormValues) => errors[k]?.message;
  const aria = (k: keyof CharacterFormValues) => ({
    "aria-invalid": !!errors[k],
    "aria-describedby": errors[k] ? `char-${k}-error` : undefined,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="data-[side=right]:sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t(character ? "editTitle" : "createTitle")}</SheetTitle>
          <SheetDescription>{t("formHint")}</SheetDescription>
        </SheetHeader>
        <form
          id="character-form"
          noValidate
          onSubmit={handleSubmit((v) => save.mutate(v))}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
        >
          <FormField id="char-name" label={t("name")} error={err("name")}>
            <Input id="char-name" maxLength={200} {...aria("name")} {...register("name")} />
          </FormField>
          <FormField id="char-voiceId" label={t("voiceId")} hint={t("voiceIdHint")}>
            <Input id="char-voiceId" autoComplete="off" {...register("voiceId")} />
          </FormField>
          <FormField id="char-source" label={t("source")}>
            <Input id="char-source" {...register("source")} />
          </FormField>
          <FormField
            id="char-memoryRule"
            label={t("memoryRule")}
            hint={`${memoryLen}/${MEMORY_MAX}`}
            error={err("memoryRule")}
          >
            <Textarea id="char-memoryRule" rows={3} {...aria("memoryRule")} {...register("memoryRule")} />
          </FormField>
          <FormField
            id="char-systemPrompt"
            label={t("systemPrompt")}
            hint={`${promptLen}/${PROMPT_MAX}`}
            error={err("systemPrompt")}
          >
            <Textarea
              id="char-systemPrompt"
              rows={14}
              className="font-mono"
              {...aria("systemPrompt")}
              {...register("systemPrompt")}
            />
          </FormField>
        </form>
        <SheetFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button type="submit" form="character-form" disabled={save.isPending}>
            {save.isPending ? t("saving") : t("save")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
