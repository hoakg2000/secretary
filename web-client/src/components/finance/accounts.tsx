"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark, Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/components/chat/error-message";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState, ListSkeleton, QueryError } from "@/components/query-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteAccount, listAccounts } from "@/lib/api/endpoints/finance";
import type { BankAccount } from "@/lib/api/types";
import { accountsKey, FINANCE_KEY } from "@/lib/finance/keys";
import { formatMoney } from "@/lib/finance/money";
import { AccountDialog } from "./account-dialog";
import { AdjustBalanceDialog } from "./adjust-balance-dialog";

export function Accounts() {
  const t = useTranslations("finance");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [includeInactive, setIncludeInactive] = useState(false);
  const [dialog, setDialog] = useState<{ account?: BankAccount } | null>(null);
  const [adjusting, setAdjusting] = useState<BankAccount | null>(null);
  const [toDelete, setToDelete] = useState<BankAccount | null>(null);

  const query = useQuery({ queryKey: accountsKey(includeInactive), queryFn: () => listAccounts(includeInactive) });

  const remove = useMutation({
    mutationFn: (a: BankAccount) => deleteAccount(a.id),
    onSuccess: (result) => {
      toast.success(t(result ? "accountDeactivated" : "accountDeleted"));
      void queryClient.invalidateQueries({ queryKey: FINANCE_KEY });
      setToDelete(null);
    },
    onError: (e) => toast.error(errorMessage(e, t("accountDeleteError"))),
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Switch id="acc-inactive" checked={includeInactive} onCheckedChange={setIncludeInactive} />
          <Label htmlFor="acc-inactive">{t("showInactive")}</Label>
        </div>
        <Button onClick={() => setDialog({})}>
          <Plus aria-hidden />
          {t("newAccount")}
        </Button>
      </div>

      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <QueryError error={query.error} fallback={t("accountsError")} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState>{t("accountsEmpty")}</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("accountName")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("bankCode")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("accountNumber")}</TableHead>
                <TableHead className="text-right">{t("balance")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead className="w-32">
                  <span className="sr-only">{t("actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.accountName}</TableCell>
                  <TableCell className="hidden md:table-cell">{a.bankCode}</TableCell>
                  <TableCell className="hidden font-mono text-xs md:table-cell">{a.accountNumber}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(a.cachedBalance, a.currency, locale)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={a.isActive ? "default" : "outline"}>{t(a.isActive ? "active" : "inactive")}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("adjustLabel", { name: a.accountName })}
                        onClick={() => setAdjusting(a)}
                      >
                        <Landmark aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("editLabel", { name: a.accountName })}
                        onClick={() => setDialog({ account: a })}
                      >
                        <Pencil aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive"
                        aria-label={t("deleteLabel", { name: a.accountName })}
                        onClick={() => setToDelete(a)}
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

      <AccountDialog open={dialog !== null} account={dialog?.account} onOpenChange={(o) => !o && setDialog(null)} />
      <AdjustBalanceDialog account={adjusting} onClose={() => setAdjusting(null)} />
      <ConfirmDialog
        open={toDelete !== null}
        title={t("deleteAccountTitle")}
        description={t("deleteAccountDescription", { name: toDelete?.accountName ?? "" })}
        confirmLabel={t("delete")}
        pending={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
