"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createAccount, updateAccount } from "@/lib/api/endpoints/finance";
import type { BankAccount } from "@/lib/api/types";
import { FINANCE_KEY } from "@/lib/finance/keys";
import { hasMaxTwoDecimals, parseAmount } from "@/lib/finance/money";

interface Values {
  accountName: string;
  bankCode: string;
  accountNumber: string;
  currency: string;
  cachedBalance: string;
  isActive: boolean;
}

const defaults = (a?: BankAccount): Values => ({
  accountName: a?.accountName ?? "",
  bankCode: a?.bankCode ?? "",
  accountNumber: a?.accountNumber ?? "",
  currency: a?.currency ?? "VND",
  cachedBalance: "0",
  isActive: a?.isActive ?? true,
});

export function AccountDialog({
  open,
  account,
  onOpenChange,
}: {
  open: boolean;
  account?: BankAccount;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("finance");
  const c = useTranslations("common");
  const queryClient = useQueryClient();

  const schema = useMemo(
    () =>
      z.object({
        accountName: z.string().trim().min(1, c("required")),
        bankCode: z.string().trim().min(1, c("required")),
        accountNumber: z.string().trim().min(1, c("required")),
        currency: z.string().trim().regex(/^[A-Za-z]{3}$/, t("currencyInvalid")),
        cachedBalance: z.string().refine((v) => {
          const n = parseAmount(v);
          return n !== null && hasMaxTwoDecimals(n);
        }, t("amountInvalid")),
        isActive: z.boolean(),
      }),
    [t, c],
  );
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults(account) });

  useEffect(() => {
    if (open) reset(defaults(account));
  }, [open, account, reset]);

  const save = useMutation({
    mutationFn: (v: Values) => {
      const base = {
        accountName: v.accountName.trim(),
        bankCode: v.bankCode.trim(),
        accountNumber: v.accountNumber.trim(),
        currency: v.currency.trim().toUpperCase(),
      };
      return account
        ? updateAccount(account.id, { ...base, isActive: v.isActive })
        : createAccount({ ...base, cachedBalance: parseAmount(v.cachedBalance) ?? 0 });
    },
    onSuccess: () => {
      toast.success(t(account ? "accountSaved" : "accountCreated"));
      void queryClient.invalidateQueries({ queryKey: FINANCE_KEY });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e, t("accountSaveError"))),
  });

  const aria = (k: keyof Values) => ({
    "aria-invalid": !!errors[k],
    "aria-describedby": errors[k] ? `acc-${k}-error` : undefined,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(account ? "editAccount" : "newAccount")}</DialogTitle>
          <DialogDescription>{t("accountHint")}</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={handleSubmit((v) => save.mutate(v))} className="flex flex-col gap-4">
          <FormField id="acc-accountName" label={t("accountName")} error={errors.accountName?.message}>
            <Input id="acc-accountName" {...aria("accountName")} {...register("accountName")} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="acc-bankCode" label={t("bankCode")} error={errors.bankCode?.message}>
              <Input id="acc-bankCode" {...aria("bankCode")} {...register("bankCode")} />
            </FormField>
            <FormField id="acc-accountNumber" label={t("accountNumber")} error={errors.accountNumber?.message}>
              <Input id="acc-accountNumber" {...aria("accountNumber")} {...register("accountNumber")} />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="acc-currency" label={t("currency")} error={errors.currency?.message}>
              <Input id="acc-currency" maxLength={3} {...aria("currency")} {...register("currency")} />
            </FormField>
            {!account && (
              <FormField id="acc-cachedBalance" label={t("openingBalance")} error={errors.cachedBalance?.message}>
                <Input id="acc-cachedBalance" inputMode="decimal" {...aria("cachedBalance")} {...register("cachedBalance")} />
              </FormField>
            )}
          </div>
          {account && (
            <div className="flex items-center gap-2">
              <Controller
                control={control}
                name="isActive"
                render={({ field }) => (
                  <Switch aria-labelledby="acc-active-label" checked={field.value} onCheckedChange={field.onChange} />
                )}
              />
              <Label id="acc-active-label">{t("active")}</Label>
            </div>
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
