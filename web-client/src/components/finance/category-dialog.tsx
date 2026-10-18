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
import { createCategory, updateCategory } from "@/lib/api/endpoints/finance";
import type { Category, TransactionType } from "@/lib/api/types";
import { CATEGORIES_KEY } from "@/lib/finance/keys";
import { amountToInput, hasMaxTwoDecimals, parseAmount } from "@/lib/finance/money";

export const TYPES: TransactionType[] = ["EXPENSE", "INCOME"];

interface Values {
  name: string;
  type: TransactionType;
  icon: string;
  budgetLimit: string;
}

const defaults = (c?: Category): Values => ({
  name: c?.name ?? "",
  type: c?.type ?? "EXPENSE",
  icon: c?.icon ?? "",
  budgetLimit: c?.budgetLimit ? amountToInput(c.budgetLimit) : "",
});

export function CategoryDialog({
  open,
  category,
  onOpenChange,
}: {
  open: boolean;
  category?: Category;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("finance");
  const c = useTranslations("common");
  const queryClient = useQueryClient();

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, c("required")),
        type: z.enum(["EXPENSE", "INCOME"]),
        icon: z.string(),
        budgetLimit: z.string().refine((v) => {
          if (!v.trim()) return true;
          const n = parseAmount(v);
          return n !== null && hasMaxTwoDecimals(n);
        }, t("amountInvalid")),
      }),
    [t, c],
  );
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults(category) });

  useEffect(() => {
    if (open) reset(defaults(category));
  }, [open, category, reset]);

  const save = useMutation({
    mutationFn: (v: Values) => {
      const icon = v.icon.trim();
      const budget = v.budgetLimit.trim() ? parseAmount(v.budgetLimit) : null;
      if (category) {
        // emptied fields that had a value are sent as null so the server clears them
        return updateCategory(category.id, {
          name: v.name.trim(),
          ...(icon ? { icon } : category.icon !== null && { icon: null }),
          ...(budget !== null ? { budgetLimit: budget } : category.budgetLimit !== null && { budgetLimit: null }),
        });
      }
      return createCategory({
        name: v.name.trim(),
        type: v.type,
        ...(icon && { icon }),
        ...(budget !== null && { budgetLimit: budget }),
      });
    },
    onSuccess: () => {
      toast.success(t(category ? "categorySaved" : "categoryCreated"));
      void queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e, t("categorySaveError"))),
  });

  const typeItems = TYPES.map((v) => ({ value: v, label: t(`type.${v}`) }));

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(category ? "editCategory" : "newCategory")}</DialogTitle>
          <DialogDescription>{category ? t("categoryTypeLocked") : t("categoryHint")}</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={handleSubmit((v) => save.mutate(v))} className="flex flex-col gap-4">
          <FormField id="cat-name" label={t("categoryName")} error={errors.name?.message}>
            <Input
              id="cat-name"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "cat-name-error" : undefined}
              {...register("name")}
            />
          </FormField>
          <div className="flex flex-col gap-1.5">
            <Label id="cat-type-label">{t("typeLabel")}</Label>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <SimpleSelect
                  items={typeItems}
                  value={field.value}
                  onChange={field.onChange}
                  labelledBy="cat-type-label"
                  disabled={!!category}
                />
              )}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="cat-icon" label={t("iconOptional")}>
              <Input id="cat-icon" {...register("icon")} />
            </FormField>
            <FormField id="cat-budget" label={t("budgetOptional")} error={errors.budgetLimit?.message}>
              <Input
                id="cat-budget"
                inputMode="decimal"
                aria-invalid={!!errors.budgetLimit}
                aria-describedby={errors.budgetLimit ? "cat-budget-error" : undefined}
                {...register("budgetLimit")}
              />
            </FormField>
          </div>
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
