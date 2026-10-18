"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/components/chat/error-message";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState, ListSkeleton, Pager, QueryError } from "@/components/query-states";
import { SimpleSelect } from "@/components/simple-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  deleteTransaction,
  listAccounts,
  listCategories,
  searchTransactions,
} from "@/lib/api/endpoints/finance";
import type { Transaction, TransactionFilter, TransactionType } from "@/lib/api/types";
import { dayStart } from "@/lib/calendar/helpers";
import { accountsKey, CATEGORIES_KEY, FINANCE_KEY, TRANSACTIONS_KEY } from "@/lib/finance/keys";
import { endOfDay, formatMoney } from "@/lib/finance/money";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TYPES } from "./category-dialog";
import { TransactionDialog } from "./transaction-dialog";

const PAGE_SIZE = 20;
const ALL = "all";

interface Draft {
  accountId: string;
  categoryId: string;
  type: string;
  from: string;
  to: string;
}

const EMPTY: Draft = { accountId: ALL, categoryId: ALL, type: ALL, from: "", to: "" };

const toFilter = (d: Draft): TransactionFilter => ({
  ...(d.accountId !== ALL && { accountId: d.accountId }),
  ...(d.categoryId !== ALL && { categoryId: d.categoryId }),
  ...(d.type !== ALL && { type: d.type as TransactionType }),
  ...(d.from && { startDate: dayStart(d.from).toISOString() }),
  ...(d.to && { endDate: endOfDay(d.to) }),
});

export function Transactions() {
  const t = useTranslations("finance");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [applied, setApplied] = useState<Draft>(EMPTY);
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{ transaction?: Transaction } | null>(null);
  const [toDelete, setToDelete] = useState<Transaction | null>(null);

  const accounts = useQuery({ queryKey: accountsKey(true), queryFn: () => listAccounts(true) });
  const categories = useQuery({ queryKey: [...CATEGORIES_KEY, "all"], queryFn: () => listCategories() });
  const query = useQuery({
    queryKey: [...TRANSACTIONS_KEY, applied, page],
    queryFn: () => searchTransactions({ ...toFilter(applied), page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: (tx: Transaction) => deleteTransaction(tx.id),
    onSuccess: () => {
      toast.success(t("transactionDeleted"));
      void queryClient.invalidateQueries({ queryKey: FINANCE_KEY });
      setToDelete(null);
    },
    onError: (e) => toast.error(errorMessage(e, t("transactionDeleteError"))),
  });

  const accountById = useMemo(() => new Map((accounts.data ?? []).map((a) => [a.id, a])), [accounts.data]);
  const categoryById = useMemo(() => new Map((categories.data ?? []).map((c) => [c.id, c])), [categories.data]);

  const accountItems = [
    { value: ALL, label: t("allAccounts") },
    ...(accounts.data ?? []).map((a) => ({ value: a.id, label: a.accountName })),
  ];
  const categoryItems = [
    { value: ALL, label: t("allCategories") },
    ...(categories.data ?? [])
      .filter((c) => draft.type === ALL || c.type === draft.type)
      .map((c) => ({ value: c.id, label: c.name })),
  ];
  const typeItems = [{ value: ALL, label: t("type.all") }, ...TYPES.map((v) => ({ value: v, label: t(`type.${v}`) }))];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setApplied(draft);
    setPage(1);
  };
  const reset = () => {
    setDraft(EMPTY);
    setApplied(EMPTY);
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={submit} role="search" aria-label={t("searchTransactions")} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label id="tf-account">{t("account")}</Label>
          <SimpleSelect
            items={accountItems}
            value={draft.accountId}
            onChange={(v) => setDraft((d) => ({ ...d, accountId: v }))}
            labelledBy="tf-account"
            className="w-44"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label id="tf-type">{t("typeLabel")}</Label>
          <SimpleSelect
            items={typeItems}
            value={draft.type}
            onChange={(v) => setDraft((d) => ({ ...d, type: v, categoryId: ALL }))}
            labelledBy="tf-type"
            className="w-32"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label id="tf-category">{t("category")}</Label>
          <SimpleSelect
            items={categoryItems}
            value={draft.categoryId}
            onChange={(v) => setDraft((d) => ({ ...d, categoryId: v }))}
            labelledBy="tf-category"
            className="w-44"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tf-from">{t("from")}</Label>
          <Input id="tf-from" type="date" value={draft.from} max={draft.to || undefined} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} className="w-40" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tf-to">{t("to")}</Label>
          <Input id="tf-to" type="date" value={draft.to} min={draft.from || undefined} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} className="w-40" />
        </div>
        <Button type="submit">
          <Search aria-hidden />
          {t("search")}
        </Button>
        <Button type="button" variant="outline" onClick={reset}>
          {t("clear")}
        </Button>
        <Button type="button" className="ml-auto" onClick={() => setDialog({})}>
          <Plus aria-hidden />
          {t("newTransaction")}
        </Button>
      </form>

      {query.isPending ? (
        <ListSkeleton rows={6} />
      ) : query.isError ? (
        <QueryError error={query.error} fallback={t("transactionsError")} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState>{t("transactionsEmpty")}</EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("time")}</TableHead>
                  <TableHead>{t("account")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("category")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("counterparty")}</TableHead>
                  <TableHead className="text-right">{t("amount")}</TableHead>
                  <TableHead className="w-24">
                    <span className="sr-only">{t("actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.items.map((tx) => {
                  const account = accountById.get(tx.accountId);
                  const income = tx.type === "INCOME";
                  return (
                    <TableRow key={tx.id}>
                      <TableCell className="whitespace-nowrap">{formatDateTime(tx.transactionTime, locale)}</TableCell>
                      <TableCell>{account?.accountName ?? "—"}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {(tx.categoryId && categoryById.get(tx.categoryId)?.name) || "—"}
                      </TableCell>
                      <TableCell className="hidden max-w-56 truncate lg:table-cell" title={tx.note ?? undefined}>
                        {tx.counterparty ?? ""}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-medium tabular-nums whitespace-nowrap",
                          income ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
                        )}
                      >
                        <span className="sr-only">{t(`type.${tx.type}`)} </span>
                        {income ? "+" : "−"}
                        {formatMoney(tx.amount, account?.currency ?? "VND", locale)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t("editTransactionLabel")}
                            onClick={() => setDialog({ transaction: tx })}
                          >
                            <Pencil aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive"
                            aria-label={t("deleteTransactionLabel")}
                            onClick={() => setToDelete(tx)}
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Pager page={page} total={query.data.total} pageSize={query.data.pageSize} onPage={setPage} />
        </>
      )}

      <TransactionDialog
        open={dialog !== null}
        transaction={dialog?.transaction}
        onOpenChange={(o) => !o && setDialog(null)}
      />
      <ConfirmDialog
        open={toDelete !== null}
        title={t("deleteTransactionTitle")}
        description={t("deleteTransactionDescription")}
        confirmLabel={t("delete")}
        pending={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
