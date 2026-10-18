"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { EmptyState, ListSkeleton, QueryError } from "@/components/query-states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSummary, getTotalBalance } from "@/lib/api/endpoints/finance";
import { shiftMonth } from "@/lib/calendar/helpers";
import { summaryKey, totalBalanceKey } from "@/lib/finance/keys";
import { currentMonth, formatMoney, monthRange } from "@/lib/finance/money";
import { cn } from "@/lib/utils";

export function Overview() {
  const t = useTranslations("finance");
  const locale = useLocale();
  const now = currentMonth();
  const [cursor, setCursor] = useState(now);
  const isCurrent = cursor.year === now.year && cursor.month === now.month;

  const balance = useQuery({ queryKey: totalBalanceKey, queryFn: getTotalBalance });
  const summary = useQuery({
    queryKey: summaryKey(cursor.year, cursor.month),
    queryFn: () => getSummary(monthRange(cursor.year, cursor.month)),
  });

  const monthTitle = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    Date.UTC(cursor.year, cursor.month - 1, 1),
  );

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="fin-balance" className="flex flex-col gap-3">
        <h2 id="fin-balance" className="text-base font-medium">
          {t("totalBalance")}
        </h2>
        {balance.isPending ? (
          <ListSkeleton rows={1} className="h-24" />
        ) : balance.isError ? (
          <QueryError error={balance.error} fallback={t("balanceError")} onRetry={() => void balance.refetch()} />
        ) : balance.data.totals.length === 0 ? (
          <EmptyState>{t("noAccounts")}</EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {balance.data.totals.map((r) => (
              <Card key={r.currency}>
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {r.currency} · {t("accountCount", { count: r.totalAccounts })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold tabular-nums">
                  {formatMoney(r.totalBalance, r.currency, locale)}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="fin-month" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="fin-month" className="mr-auto text-base font-medium">
            {t("monthSummary")}: <span className="capitalize">{monthTitle}</span>
          </h2>
          <Button
            variant="outline"
            size="icon"
            aria-label={t("prevMonth")}
            onClick={() => setCursor((c) => shiftMonth(c.year, c.month, -1))}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button variant="outline" disabled={isCurrent} onClick={() => setCursor(now)}>
            {t("thisMonth")}
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label={t("nextMonth")}
            onClick={() => setCursor((c) => shiftMonth(c.year, c.month, 1))}
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
        {summary.isPending ? (
          <ListSkeleton rows={1} className="h-28" />
        ) : summary.isError ? (
          <QueryError error={summary.error} fallback={t("summaryError")} onRetry={() => void summary.refetch()} />
        ) : summary.data.totals.length === 0 ? (
          <EmptyState>{t("noMonthData")}</EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {summary.data.totals.map((r) => (
              <Card key={r.currency}>
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">{r.currency}</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="text-muted-foreground">{t("income")}</dt>
                      <dd className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {formatMoney(r.income, r.currency, locale)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t("expense")}</dt>
                      <dd className="font-semibold tabular-nums text-red-600 dark:text-red-400">
                        {formatMoney(r.expense, r.currency, locale)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t("net")}</dt>
                      <dd className={cn("font-semibold tabular-nums", Number(r.net) < 0 && "text-red-600 dark:text-red-400")}>
                        {formatMoney(r.net, r.currency, locale)}
                      </dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
