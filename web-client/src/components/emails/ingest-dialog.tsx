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
import { ingestEmail } from "@/lib/api/endpoints/email";
import { CALENDAR_KEY } from "@/lib/calendar/keys";
import { EMAIL_LOGS_KEY } from "@/lib/emails/keys";
import { FINANCE_KEY } from "@/lib/finance/keys";

interface Values {
  messageId: string;
  sender: string;
  subject: string;
  rawBody: string;
}

const defaults = (): Values => ({ messageId: `manual-${Date.now()}`, sender: "", subject: "", rawBody: "" });

export function IngestDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("emails");
  const queryClient = useQueryClient();
  const schema = useMemo(
    () =>
      z.object({
        messageId: z.string().trim().min(1, t("required")),
        sender: z.string().trim().min(1, t("required")),
        subject: z.string(),
        rawBody: z.string(),
      }),
    [t],
  );
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults() });

  // Fresh generated messageId each time the dialog opens
  useEffect(() => {
    if (open) reset(defaults());
  }, [open, reset]);

  const ingest = useMutation({
    mutationFn: (v: Values) =>
      ingestEmail({
        messageId: v.messageId.trim(),
        sender: v.sender.trim(),
        ...(v.subject.trim() && { subject: v.subject.trim() }),
        ...(v.rawBody.trim() && { rawBody: v.rawBody }),
      }),
    onSuccess: (log) => {
      // null = the messageId was already processed
      if (log) toast.success(t("ingested", { status: t(`status.${log.status}`) }));
      else toast.info(t("ingestDuplicate"));
      void queryClient.invalidateQueries({ queryKey: EMAIL_LOGS_KEY });
      void queryClient.invalidateQueries({ queryKey: FINANCE_KEY });
      void queryClient.invalidateQueries({ queryKey: CALENDAR_KEY });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e, t("ingestError"))),
  });

  const aria = (k: keyof Values) => ({
    "aria-invalid": !!errors[k],
    "aria-describedby": errors[k] ? `ingest-${k}-error` : undefined,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("ingestTitle")}</DialogTitle>
          <DialogDescription>{t("ingestHint")}</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={handleSubmit((v) => ingest.mutate(v))} className="flex flex-col gap-4">
          <FormField id="ingest-messageId" label={t("messageId")} error={errors.messageId?.message}>
            <Input id="ingest-messageId" {...aria("messageId")} {...register("messageId")} />
          </FormField>
          <FormField id="ingest-sender" label={t("sender")} error={errors.sender?.message}>
            <Input id="ingest-sender" {...aria("sender")} {...register("sender")} />
          </FormField>
          <FormField id="ingest-subject" label={t("subjectOptional")}>
            <Input id="ingest-subject" {...register("subject")} />
          </FormField>
          <FormField id="ingest-rawBody" label={t("rawBodyOptional")}>
            <Textarea id="ingest-rawBody" rows={6} {...register("rawBody")} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={ingest.isPending}>
              {ingest.isPending ? t("ingesting") : t("ingest")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
