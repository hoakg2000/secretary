"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { errorMessage } from "@/components/chat/error-message";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveMemory, updateMemory } from "@/lib/api/endpoints/memories";
import type { Memory } from "@/lib/api/types";
import { MEMORIES_KEY } from "@/lib/memories/keys";

interface Values {
  content: string;
  category: string;
}

const defaults = (m?: Memory): Values => ({ content: m?.content ?? "", category: m?.category ?? "" });

export function MemoryDialog({
  open,
  memory,
  onOpenChange,
}: {
  open: boolean;
  memory?: Memory;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("memories");
  const c = useTranslations("common");
  const queryClient = useQueryClient();

  const schema = useMemo(
    () => z.object({ content: z.string().trim().min(1, c("required")), category: z.string() }),
    [c],
  );
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults(memory) });

  const save = useMutation({
    mutationFn: (v: Values) => {
      const category = v.category.trim();
      if (memory) {
        // an emptied category is sent as null so the server clears it
        return updateMemory(memory.id, { content: v.content.trim(), category: category || null });
      }
      return saveMemory({ content: v.content.trim(), ...(category && { category }) });
    },
    onSuccess: () => {
      toast.success(t(memory ? "saved" : "created"));
      void queryClient.invalidateQueries({ queryKey: MEMORIES_KEY });
      onOpenChange(false);
    },
  });

  useEffect(() => {
    if (open) {
      reset(defaults(memory));
      save.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- save.reset is stable enough; resetting only when the dialog opens
  }, [open, memory, reset]);

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(memory ? "editTitle" : "newTitle")}</DialogTitle>
          <DialogDescription>{t("formHint")}</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={handleSubmit((v) => save.mutate(v))} className="flex flex-col gap-4">
          <FormField id="mem-content" label={t("content")} error={errors.content?.message}>
            <Textarea
              id="mem-content"
              rows={5}
              aria-invalid={!!errors.content}
              aria-describedby={errors.content ? "mem-content-error" : undefined}
              {...register("content")}
            />
          </FormField>
          <FormField id="mem-category" label={t("categoryOptional")}>
            <Input id="mem-category" {...register("category")} />
          </FormField>
          {save.isError && (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {errorMessage(save.error, t("saveError"))}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={save.isPending} onClick={() => onOpenChange(false)}>
              {c("cancel")}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? c("saving") : c("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
