"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
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
import { createEvent, deleteEvent, updateEvent } from "@/lib/api/endpoints/calendar";
import type { CalendarEvent } from "@/lib/api/types";
import { CALENDAR_KEY } from "@/lib/calendar/keys";
import { eventFormValues, toCreateInput, toPatch, type EventFormValues } from "@/lib/calendar/payload";
import { SyncBadge } from "./sync-badge";

export interface EventDialogState {
  event?: CalendarEvent;
  /** yyyy-MM-dd prefill for a new event */
  day?: string;
}

export function EventDialog({
  state,
  onClose,
}: {
  state: EventDialogState | null;
  onClose: () => void;
}) {
  const t = useTranslations("calendar");
  const queryClient = useQueryClient();
  const event = state?.event;
  const [confirmDelete, setConfirmDelete] = useState(false);

  const schema = useMemo(
    () =>
      z
        .object({
          title: z.string().trim().min(1, t("titleRequired")),
          description: z.string(),
          location: z.string(),
          startTime: z.string().min(1, t("timeRequired")),
          endTime: z.string().min(1, t("timeRequired")),
          intent: z.string(),
          priorityStatus: z.string(),
        })
        // datetime-local values share one format, so string order is time order
        .refine((v) => !v.startTime || !v.endTime || v.endTime > v.startTime, {
          path: ["endTime"],
          message: t("endAfterStart"),
        }),
    [t],
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EventFormValues>({ resolver: zodResolver(schema), defaultValues: eventFormValues(event, state?.day) });

  useEffect(() => {
    if (state) reset(eventFormValues(state.event, state.day));
  }, [state, reset]);

  const close = () => {
    setConfirmDelete(false);
    onClose();
  };

  const done = (message: string) => {
    toast.success(message);
    void queryClient.invalidateQueries({ queryKey: CALENDAR_KEY });
    close();
  };

  const save = useMutation({
    mutationFn: (v: EventFormValues) =>
      event ? updateEvent(event.id, toPatch(v, event)) : createEvent(toCreateInput(v)),
    onSuccess: () => done(t(event ? "saved" : "created")),
    onError: (e) => toast.error(errorMessage(e, t("saveError"))),
  });

  const remove = useMutation({
    mutationFn: () => deleteEvent(event!.id),
    onSuccess: () => done(t("deleted")),
    onError: (e) => toast.error(errorMessage(e, t("deleteError"))),
  });

  const busy = save.isPending || remove.isPending;
  const aria = (k: keyof EventFormValues) => ({
    "aria-invalid": !!errors[k],
    "aria-describedby": errors[k] ? `event-${k}-error` : undefined,
  });

  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && !busy && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(event ? "editEvent" : "newEvent")}</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            {t("timezoneHint")}
            {event?.syncState && <SyncBadge status={event.syncState.syncStatus} />}
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={handleSubmit((v) => save.mutate(v))} className="flex flex-col gap-4">
          <FormField id="event-title" label={t("fieldTitle")} error={errors.title?.message}>
            <Input id="event-title" {...aria("title")} {...register("title")} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="event-startTime" label={t("start")} error={errors.startTime?.message}>
              <Input id="event-startTime" type="datetime-local" {...aria("startTime")} {...register("startTime")} />
            </FormField>
            <FormField id="event-endTime" label={t("end")} error={errors.endTime?.message}>
              <Input id="event-endTime" type="datetime-local" {...aria("endTime")} {...register("endTime")} />
            </FormField>
          </div>
          <FormField id="event-location" label={t("location")}>
            <Input id="event-location" {...register("location")} />
          </FormField>
          <FormField id="event-description" label={t("description")}>
            <Textarea id="event-description" rows={3} {...register("description")} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="event-intent" label={t("intent")}>
              <Input id="event-intent" {...register("intent")} />
            </FormField>
            <FormField id="event-priorityStatus" label={t("priority")}>
              <Input id="event-priorityStatus" {...register("priorityStatus")} />
            </FormField>
          </div>
          <DialogFooter className="sm:justify-between">
            {event ? (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm">{t("deleteConfirm")}</span>
                  <Button type="button" variant="destructive" disabled={busy} onClick={() => remove.mutate()}>
                    {t("delete")}
                  </Button>
                  <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmDelete(false)}>
                    {t("cancel")}
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="outline" className="text-destructive" onClick={() => setConfirmDelete(true)}>
                  {t("delete")}
                </Button>
              )
            ) : (
              <span />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" disabled={busy} onClick={close}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={busy}>
                {save.isPending ? t("saving") : t("save")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
