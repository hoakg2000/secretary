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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api/client";
import { createEmailRule, updateEmailRule } from "@/lib/api/endpoints/email";
import type { EmailMatcher, EmailRule, EmailRuleType } from "@/lib/api/types";
import { EMAIL_RULES_KEY } from "@/lib/emails/keys";

export const RULE_TYPES: EmailRuleType[] = ["blacklist", "moneylist", "whitelist"];
const MATCHERS: EmailMatcher[] = ["sender", "keyword", "regex"];

interface Values {
  type: EmailRuleType;
  matcher: EmailMatcher;
  matchValue: string;
  description: string;
  isActive: boolean;
}

const defaults = (r?: EmailRule): Values => ({
  type: r?.type ?? "blacklist",
  matcher: r?.matcher ?? "sender",
  matchValue: r?.matchValue ?? "",
  description: r?.description ?? "",
  isActive: r?.isActive ?? true,
});

export function RuleDialog({
  open,
  rule,
  onOpenChange,
}: {
  open: boolean;
  rule?: EmailRule;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("emails");
  const queryClient = useQueryClient();
  const schema = useMemo(
    () =>
      z.object({
        type: z.enum(["blacklist", "moneylist", "whitelist"]),
        matcher: z.enum(["sender", "keyword", "regex"]),
        matchValue: z.string().trim().min(1, t("required")),
        description: z.string(),
        isActive: z.boolean(),
      }),
    [t],
  );
  const {
    register,
    handleSubmit,
    reset,
    control,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults(rule) });

  useEffect(() => {
    if (open) reset(defaults(rule));
  }, [open, rule, reset]);

  const save = useMutation({
    mutationFn: (v: Values) => {
      const input = {
        type: v.type,
        matcher: v.matcher,
        matchValue: v.matchValue.trim(),
        isActive: v.isActive,
      };
      const description = v.description.trim();
      if (rule) {
        // null clears a description that had a value
        return updateEmailRule(rule.id, { ...input, description: description || (rule.description ? null : undefined) });
      }
      return createEmailRule({ ...input, ...(description && { description }) });
    },
    onSuccess: () => {
      toast.success(t(rule ? "ruleSaved" : "ruleCreated"));
      void queryClient.invalidateQueries({ queryKey: EMAIL_RULES_KEY });
      onOpenChange(false);
    },
    onError: (e) => {
      // 400 = invalid regex (or empty value): show it on the field
      if (e instanceof ApiError && e.status === 400) setError("matchValue", { message: e.message });
      else toast.error(errorMessage(e, t("ruleSaveError")));
    },
  });

  const typeItems = RULE_TYPES.map((v) => ({ value: v, label: t(`ruleType.${v}`) }));
  const matcherItems = MATCHERS.map((v) => ({ value: v, label: t(`matcher.${v}`) }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(rule ? "editRule" : "newRule")}</DialogTitle>
          <DialogDescription>{t("ruleHint")}</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={handleSubmit((v) => save.mutate(v))} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label id="rule-type-label">{t("ruleTypeLabel")}</Label>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select items={typeItems} value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                    <SelectTrigger aria-labelledby="rule-type-label" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {typeItems.map((i) => (
                        <SelectItem key={i.value} value={i.value}>
                          {i.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label id="rule-matcher-label">{t("matcherLabel")}</Label>
              <Controller
                control={control}
                name="matcher"
                render={({ field }) => (
                  <Select items={matcherItems} value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                    <SelectTrigger aria-labelledby="rule-matcher-label" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {matcherItems.map((i) => (
                        <SelectItem key={i.value} value={i.value}>
                          {i.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
          <FormField id="rule-matchValue" label={t("matchValue")} error={errors.matchValue?.message}>
            <Input
              id="rule-matchValue"
              aria-invalid={!!errors.matchValue}
              aria-describedby={errors.matchValue ? "rule-matchValue-error" : undefined}
              {...register("matchValue")}
            />
          </FormField>
          <FormField id="rule-description" label={t("descriptionOptional")}>
            <Input id="rule-description" {...register("description")} />
          </FormField>
          <div className="flex items-center gap-2">
            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <Switch aria-labelledby="rule-active-label" checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
            <Label id="rule-active-label">{t("active")}</Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
