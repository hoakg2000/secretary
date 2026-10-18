"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
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
import { adjustBalance } from "@/lib/api/endpoints/finance";
import type { BankAccount } from "@/lib/api/types";
import { FINANCE_KEY } from "@/lib/finance/keys";
import { amountToInput, formatMoney, hasMaxTwoDecimals, parseAmount } from "@/lib/finance/money";

interface Values {
  newBalance: string;
  note: string;
}

export function AdjustBalanceDialog({ account, onClose }: { account: BankAccount | null; onClose: () => void }) {
  const t = useTranslations("finance");
  const c = useTranslations("common");
  const locale = useLocale();
  const queryClient = useQueryClient();

  const schema = useMemo(
    () =>
      z.object({
        newBalance: z.string().refine((v) => {
          const n = parseAmount(v);
          return n !== null && hasMaxTwoDecimals(n);
        }, t("amountInvalid")),
        note: z.string(),
      }),
    [t],
  );
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { newBalance: "", note: "" } });

  useEffect(() => {
    if (account) reset({ newBalance: amountToInput(account.cachedBalance), note: "" });
  }, [account, reset]);

  const save = useMutation({
    mutationFn: (v: Values) =>
      adjustBalance(account!.id, { newBalance: parseAmount(v.newBalance) ?? 0, ...(v.note.trim() && { note: v.note.trim() }) }),
    onSuccess: () => {
      toast.success(t("balanceAdjusted"));
      void queryClient.invalidateQueries({ queryKey: FINANCE_KEY });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e, t("adjustError"))),
  });

  return (
    <Dialog open={!!account} onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("adjustBalance")}</DialogTitle>
          <DialogDescription>
            {account &&
              t("adjustHint", {
                name: account.accountName,
                balance: formatMoney(account.cachedBalance, account.currency, locale),
              })}
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={handleSubmit((v) => save.mutate(v))} className="flex flex-col gap-4">
          <FormField id="adj-newBalance" label={t("newBalance")} error={errors.newBalance?.message}>
            <Input
              id="adj-newBalance"
              inputMode="decimal"
              aria-invalid={!!errors.newBalance}
              aria-describedby={errors.newBalance ? "adj-newBalance-error" : undefined}
              {...register("newBalance")}
            />
          </FormField>
          <FormField id="adj-note" label={t("noteOptional")}>
            <Input id="adj-note" {...register("note")} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>
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
