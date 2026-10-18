"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/components/chat/error-message";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState, ListSkeleton, QueryError } from "@/components/query-states";
import { SimpleSelect } from "@/components/simple-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteCategory, listCategories } from "@/lib/api/endpoints/finance";
import type { Category, TransactionType } from "@/lib/api/types";
import { CATEGORIES_KEY } from "@/lib/finance/keys";
import { CategoryDialog, TYPES } from "./category-dialog";

export function Categories() {
  const t = useTranslations("finance");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [type, setType] = useState<TransactionType | "all">("all");
  const [dialog, setDialog] = useState<{ category?: Category } | null>(null);
  const [toDelete, setToDelete] = useState<Category | null>(null);

  const query = useQuery({
    queryKey: [...CATEGORIES_KEY, type],
    queryFn: () => listCategories(type === "all" ? undefined : type),
  });

  const remove = useMutation({
    mutationFn: (c: Category) => deleteCategory(c.id),
    onSuccess: () => {
      toast.success(t("categoryDeleted"));
      void queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY });
      setToDelete(null);
    },
    onError: (e) => toast.error(errorMessage(e, t("categoryDeleteError"))),
  });

  const filterItems = [{ value: "all", label: t("type.all") }, ...TYPES.map((v) => ({ value: v, label: t(`type.${v}`) }))];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span id="cat-type-filter" className="text-sm text-muted-foreground">
            {t("typeLabel")}
          </span>
          <SimpleSelect
            items={filterItems}
            value={type}
            onChange={(v) => setType(v as TransactionType | "all")}
            labelledBy="cat-type-filter"
            className="w-40"
          />
        </div>
        <Button onClick={() => setDialog({})}>
          <Plus aria-hidden />
          {t("newCategory")}
        </Button>
      </div>

      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <QueryError error={query.error} fallback={t("categoriesError")} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState>{t("categoriesEmpty")}</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("categoryName")}</TableHead>
                <TableHead>{t("typeLabel")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("icon")}</TableHead>
                <TableHead className="text-right">{t("budgetLimit")}</TableHead>
                <TableHead className="w-24">
                  <span className="sr-only">{t("actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>
                    <Badge variant={c.type === "INCOME" ? "default" : "secondary"}>{t(`type.${c.type}`)}</Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{c.icon ?? ""}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.budgetLimit ? new Intl.NumberFormat(locale).format(Number(c.budgetLimit)) : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("editLabel", { name: c.name })}
                        onClick={() => setDialog({ category: c })}
                      >
                        <Pencil aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive"
                        aria-label={t("deleteLabel", { name: c.name })}
                        onClick={() => setToDelete(c)}
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

      <CategoryDialog open={dialog !== null} category={dialog?.category} onOpenChange={(o) => !o && setDialog(null)} />
      <ConfirmDialog
        open={toDelete !== null}
        title={t("deleteCategoryTitle")}
        description={t("deleteCategoryDescription", { name: toDelete?.name ?? "" })}
        confirmLabel={t("delete")}
        pending={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
