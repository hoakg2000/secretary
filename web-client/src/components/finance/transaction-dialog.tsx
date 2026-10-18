"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { errorMessage } from "@/components/chat/error-message";
import { FormField } from "@/components/form-field";
import { SimpleSelect } from "@/components/simple-select";
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
import { createTransaction, listAccounts, listCategories, updateTransaction } from "@/lib/api/endpoints/finance";
import type { Transaction, TransactionType } from "@/lib/api/types";
import { fromLocalInput, toLocalInput } from "@/lib/calendar/helpers";
import { accountsKey, CATEGORIES_KEY, FINANCE_KEY } from "@/lib/finance/keys";
import { amountToInput, hasMaxTwoDecimals, parseAmount } from "@/lib/finance/money";
import { TYPES } from "./category-dialog";

const NONE = "none";

interface Values {
  accountId: string;
  categoryId: string;
  amount: string;
  type: TransactionType;
  counterparty: string;
  note: string;
  /** datetime-local value, Vietnam time */
  transactionTime: string;
}

const defaults = (tx?: Transaction): Values => ({
  accountId: tx?.accountId ?? "",
  categoryId: tx?.categoryId ?? NONE,
  amount: tx ? amountToInput(tx.amount) : "",
  type: tx?.type ?? "EXPENSE",
  counterparty: tx?.counterparty ?? "",
  note: tx?.note ?? "",
  transactionTime: toLocalInput(tx?.transactionTime ?? new Date().toISOString()),
});

export function TransactionDialog({
  open,
  transaction,
  onOpenChange,
}: {
  open: boolean;
  transaction?: Transaction;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("finance");
  const c = useTranslations("common");
  const queryClient = useQueryClient();

  const accounts = useQuery({ queryKey: accountsKey(true), queryFn: () => listAccounts(true), enabled: open });
  const categories = useQuery({
    queryKey: [...CATEGORIES_KEY, "all"],
    queryFn: () => listCategories(),
    enabled: open,
  });

  const schema = useMemo(
    () =>
      z.object({
        accountId: z.string().min(1, c("required")),
        categoryId: z.string(),
        amount: z.string().refine((v) => {
          const n = parseAmount(v);
          return n !== null && n >= 0.01 && hasMaxTwoDecimals(n);
        }, t("amountPositive")),
        type: z.enum(["EXPENSE", "INCOME"]),
        counterparty: z.string(),
        note: z.string(),
        transactionTime: z.string().min(1, c("required")),
      }),
    [t, c],
  );
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults(transaction) });

  useEffect(() => {
    if (open) reset(defaults(transaction));
  }, [open, transaction, reset]);

  const type = useWatch({ control, name: "type" });
  const typedCategories = useMemo(() => (categories.data ?? []).filter((x) => x.type === type), [categories.data, type]);

  // a category of the other type is no longer valid
  useEffect(() => {
    if (!categories.data) return;
    const current = getValues("categoryId");
    if (current !== NONE && !typedCategories.some((x) => x.id === current)) setValue("categoryId", NONE);
  }, [typedCategories, categories.data, getValues, setValue]);

  const save = useMutation({
    mutationFn: (v: Values) => {
      const base = {
        accountId: v.accountId,
        amount: parseAmount(v.amount) ?? 0,
        type: v.type,
        transactionTime: fromLocalInput(v.transactionTime),
      };
      const categoryId = v.categoryId === NONE ? undefined : v.categoryId;
      if (transaction) {
        // emptied text fields cannot be cleared by PATCH (no null on the server), so only non-empty values are sent
        return updateTransaction(transaction.id, {
          ...base,
          categoryId: categoryId ?? null,
          ...(v.counterparty.trim() && { counterparty: v.counterparty.trim() }),
          ...(v.note.trim() && { note: v.note.trim() }),
        });
      }
      return createTransaction({
        ...base,
        ...(categoryId && { categoryId }),
        ...(v.counterparty.trim() && { counterparty: v.counterparty.trim() }),
        ...(v.note.trim() && { note: v.note.trim() }),
      });
    },
    onSuccess: () => {
      toast.success(t(transaction ? "transactionSaved" : "transactionCreated"));
      void queryClient.invalidateQueries({ queryKey: FINANCE_KEY });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e, t("transactionSaveError"))),
  });

  const accountItems = (accounts.data ?? [])
    .filter((a) => a.isActive || a.id === transaction?.accountId)
    .map((a) => ({ value: a.id, label: `${a.accountName} (${a.currency})` }));
  const categoryItems = [
    { value: NONE, label: t("noCategory") },
    ...typedCategories.map((x) => ({ value: x.id, label: x.name })),
  ];
  const typeItems = TYPES.map((v) => ({ value: v, label: t(`type.${v}`) }));

  const aria = (k: keyof Values) => ({
    "aria-invalid": !!errors[k],
    "aria-describedby": errors[k] ? `tx-${k}-error` : undefined,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(transaction ? "editTransaction" : "newTransaction")}</DialogTitle>
          <DialogDescription>{t("timezoneHint")}</DialogDescription>
        </DialogHeader>
        {(accounts.isError || categories.isError) && (
          <p role="alert" className="text-sm text-destructive">
            {t("formDataError")}
          </p>
        )}
        <form noValidate onSubmit={handleSubmit((v) => save.mutate(v))} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label id="tx-account-label">{t("account")}</Label>
            <Controller
              control={control}
              name="accountId"
              render={({ field }) => (
                <SimpleSelect
                  items={accountItems}
                  value={field.value}
                  onChange={field.onChange}
                  labelledBy="tx-account-label"
                />
              )}
            />
            {errors.accountId && <p className="text-sm text-destructive">{errors.accountId.message}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label id="tx-type-label">{t("typeLabel")}</Label>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <SimpleSelect items={typeItems} value={field.value} onChange={field.onChange} labelledBy="tx-type-label" />
                )}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label id="tx-category-label">{t("category")}</Label>
              <Controller
                control={control}
                name="categoryId"
                render={({ field }) => (
                  <SimpleSelect
                    items={categoryItems}
                    value={field.value}
                    onChange={field.onChange}
                    labelledBy="tx-category-label"
                  />
                )}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="tx-amount" label={t("amount")} error={errors.amount?.message}>
              <Input id="tx-amount" inputMode="decimal" {...aria("amount")} {...register("amount")} />
            </FormField>
            <FormField id="tx-transactionTime" label={t("time")} error={errors.transactionTime?.message}>
              <Input
                id="tx-transactionTime"
                type="datetime-local"
                {...aria("transactionTime")}
                {...register("transactionTime")}
              />
            </FormField>
          </div>
          <FormField id="tx-counterparty" label={t("counterparty")}>
            <Input id="tx-counterparty" {...register("counterparty")} />
          </FormField>
          <FormField id="tx-note" label={t("note")}>
            <Input id="tx-note" {...register("note")} />
          </FormField>
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
