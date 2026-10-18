"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteEmailRule, listEmailRules } from "@/lib/api/endpoints/email";
import type { EmailRule, EmailRuleType } from "@/lib/api/types";
import { EMAIL_RULES_KEY } from "@/lib/emails/keys";
import { RULE_TYPES, RuleDialog } from "./rule-dialog";

export function EmailRules() {
  const t = useTranslations("emails");
  const queryClient = useQueryClient();
  const [type, setType] = useState<EmailRuleType | "all">("all");
  const [dialog, setDialog] = useState<{ rule?: EmailRule } | null>(null);
  const [toDelete, setToDelete] = useState<EmailRule | null>(null);

  const query = useQuery({
    queryKey: [...EMAIL_RULES_KEY, type],
    queryFn: () => listEmailRules(type === "all" ? undefined : type),
  });

  const remove = useMutation({
    mutationFn: (r: EmailRule) => deleteEmailRule(r.id),
    onSuccess: () => {
      toast.success(t("ruleDeleted"));
      void queryClient.invalidateQueries({ queryKey: EMAIL_RULES_KEY });
      setToDelete(null);
    },
    onError: (e) => toast.error(errorMessage(e, t("ruleDeleteError"))),
  });

  const filterItems = [
    { value: "all", label: t("ruleType.all") },
    ...RULE_TYPES.map((v) => ({ value: v, label: t(`ruleType.${v}`) })),
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span id="rule-type-filter" className="text-sm text-muted-foreground">
            {t("filterType")}
          </span>
          <Select items={filterItems} value={type} onValueChange={(v) => setType((v ?? "all") as EmailRuleType | "all")}>
            <SelectTrigger aria-labelledby="rule-type-filter" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {filterItems.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setDialog({})}>
          <Plus aria-hidden />
          {t("newRule")}
        </Button>
      </div>

      {query.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      ) : query.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-sm text-destructive">
          {errorMessage(query.error, t("rulesError"))}
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t("retry")}
          </Button>
        </div>
      ) : query.data.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("rulesEmpty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("ruleTypeLabel")}</TableHead>
                <TableHead>{t("matcherLabel")}</TableHead>
                <TableHead>{t("matchValue")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("description")}</TableHead>
                <TableHead>{t("active")}</TableHead>
                <TableHead className="w-24">
                  <span className="sr-only">{t("actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Badge variant="secondary">{t(`ruleType.${r.type}`)}</Badge>
                  </TableCell>
                  <TableCell>{t(`matcher.${r.matcher}`)}</TableCell>
                  <TableCell className="max-w-56 truncate font-mono text-xs">{r.matchValue}</TableCell>
                  <TableCell className="hidden max-w-56 truncate text-muted-foreground md:table-cell">
                    {r.description ?? ""}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.isActive ? "default" : "outline"}>{t(r.isActive ? "on" : "off")}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("editRuleLabel", { value: r.matchValue })}
                        onClick={() => setDialog({ rule: r })}
                      >
                        <Pencil aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive"
                        aria-label={t("deleteRuleLabel", { value: r.matchValue })}
                        onClick={() => setToDelete(r)}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <RuleDialog open={dialog !== null} rule={dialog?.rule} onOpenChange={(o) => !o && setDialog(null)} />

      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && !remove.isPending && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteRuleTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteRuleDescription", { value: toDelete?.matchValue ?? "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => toDelete && remove.mutate(toDelete)}
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
