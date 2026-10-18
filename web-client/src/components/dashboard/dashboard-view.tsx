"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { EmailStatusBadge } from "@/components/emails/email-status-badge";
import { QueryError } from "@/components/query-states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { getGoogleStatus } from "@/lib/api/endpoints/auth";
import { listEvents } from "@/lib/api/endpoints/calendar";
import { listCharacters } from "@/lib/api/endpoints/characters";
import { listEmailLogs } from "@/lib/api/endpoints/email";
import { getSummary, getTotalBalance } from "@/lib/api/endpoints/finance";
import { GOOGLE_STATUS_KEY } from "@/lib/auth/keys";
import { eventsOnDay, formatTime, todayKey } from "@/lib/calendar/helpers";
import { calendarMonthKey } from "@/lib/calendar/keys";
import { CHARACTERS_KEY } from "@/lib/chat/queries";
import { EMAIL_LOGS_KEY } from "@/lib/emails/keys";
import { summaryKey, totalBalanceKey } from "@/lib/finance/keys";
import { currentMonth, formatMoney, monthRange } from "@/lib/finance/money";
import { formatDateTime } from "@/lib/format";

const UPCOMING = 5;

/** Card shell: title, link to the full page, and a body that handles its own loading / error state. */
function DashCard({
  title,
  href,
  linkLabel,
  className,
  children,
}: {
  title: string;
  href: string;
  linkLabel: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground">
          <h2>{title}</h2>
          <Link
            href={href}
            className="flex items-center gap-1 rounded text-xs outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {linkLabel}
            <ArrowRight className="size-3" aria-hidden />
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const CardSkeleton = () => <Skeleton aria-busy="true" className="h-16 w-full" />;

function BalanceCard() {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const q = useQuery({ queryKey: totalBalanceKey, queryFn: getTotalBalance });
  return (
    <DashCard title={t("totalBalance")} href="/finance" linkLabel={t("open")}>
      {q.isPending ? (
        <CardSkeleton />
      ) : q.isError ? (
        <QueryError error={q.error} fallback={t("loadError")} onRetry={() => void q.refetch()} />
      ) : q.data.totals.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noAccounts")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {q.data.totals.map((r) => (
            <li key={r.currency} className="text-xl font-semibold tabular-nums">
              {formatMoney(r.totalBalance, r.currency, locale)}
            </li>
          ))}
        </ul>
      )}
    </DashCard>
  );
}

function MonthCard() {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const { year, month } = currentMonth();
  const q = useQuery({
    queryKey: summaryKey(year, month),
    queryFn: () => getSummary(monthRange(year, month)),
  });
  return (
    <DashCard title={t("thisMonth")} href="/finance" linkLabel={t("open")}>
      {q.isPending ? (
        <CardSkeleton />
      ) : q.isError ? (
        <QueryError error={q.error} fallback={t("loadError")} onRetry={() => void q.refetch()} />
      ) : q.data.totals.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noMonthData")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {q.data.totals.map((r) => (
            <dl key={r.currency} className="grid grid-cols-3 gap-2 text-sm">
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
                <dd className="font-semibold tabular-nums">{formatMoney(r.net, r.currency, locale)}</dd>
              </div>
            </dl>
          ))}
        </div>
      )}
    </DashCard>
  );
}

function EventsCard() {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const { year, month } = currentMonth();
  const q = useQuery({
    queryKey: calendarMonthKey(year, month),
    queryFn: () => listEvents({ year, month }),
  });
  const [now] = useState(() => Date.now()); // fixed at mount; reload or refocus refreshes via remount
  const today = todayKey();
  // shortcut: current month only, so on the last days of a month the list may run short; upgrade by also fetching next month
  const upcoming = (q.data ?? [])
    .filter((e) => Date.parse(e.endTime) > now)
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
    .slice(0, UPCOMING);
  const todayCount = (q.data ?? []).filter((e) => Date.parse(e.endTime) > now && eventsOnDay([e], today).length > 0).length;
  return (
    <DashCard title={t("events")} href="/calendar" linkLabel={t("open")}>
      {q.isPending ? (
        <CardSkeleton />
      ) : q.isError ? (
        <QueryError error={q.error} fallback={t("loadError")} onRetry={() => void q.refetch()} />
      ) : upcoming.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noEvents")}</p>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">{t("todayCount", { count: todayCount })}</p>
          <ul className="flex flex-col gap-1.5">
            {upcoming.map((e) => {
              const isToday = eventsOnDay([e], today).length > 0;
              return (
                <li key={e.id} className="flex items-center gap-2 text-sm">
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {isToday ? formatTime(e.startTime) : formatDateTime(e.startTime, locale)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{e.title}</span>
                  {isToday && <Badge>{t("today")}</Badge>}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </DashCard>
  );
}

function EmailsCard() {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const latest = useQuery({
    queryKey: [...EMAIL_LOGS_KEY, "latest"],
    queryFn: () => listEmailLogs({ page: 1, pageSize: 5 }),
  });
  const failed = useQuery({
    queryKey: [...EMAIL_LOGS_KEY, "failed-count"],
    queryFn: () => listEmailLogs({ status: "FAILED", page: 1, pageSize: 1 }),
  });
  return (
    <DashCard title={t("emails")} href="/emails" linkLabel={t("open")} className="md:col-span-2">
      <div className="mb-3 flex items-center gap-2 text-sm">
        {failed.isPending ? (
          <Skeleton className="h-5 w-32" />
        ) : failed.isError ? (
          <span className="text-destructive" role="alert">
            {t("failedCountError")}
          </span>
        ) : (
          <>
            <Badge variant={failed.data.total > 0 ? "destructive" : "outline"}>{failed.data.total}</Badge>
            <span>{t("failedEmails")}</span>
          </>
        )}
      </div>
      {latest.isPending ? (
        <CardSkeleton />
      ) : latest.isError ? (
        <QueryError error={latest.error} fallback={t("loadError")} onRetry={() => void latest.refetch()} />
      ) : latest.data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noEmails")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {latest.data.items.map((log) => (
            <li key={log.id} className="flex items-center gap-2 text-sm">
              <EmailStatusBadge status={log.status} />
              <span className="min-w-0 flex-1 truncate">
                {log.subject ?? t("noSubject")} <span className="text-muted-foreground">· {log.sender}</span>
              </span>
              <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                {formatDateTime(log.createdAt, locale)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </DashCard>
  );
}

function GoogleCard() {
  const t = useTranslations("dashboard");
  const q = useQuery({ queryKey: GOOGLE_STATUS_KEY, queryFn: getGoogleStatus });
  return (
    <DashCard title={t("google")} href="/settings" linkLabel={t("settings")}>
      {q.isPending ? (
        <CardSkeleton />
      ) : q.isError ? (
        <QueryError error={q.error} fallback={t("loadError")} onRetry={() => void q.refetch()} />
      ) : (
        <div className="flex flex-col gap-1">
          <Badge variant={q.data.connected ? "default" : "outline"} className="self-start">
            {t(q.data.connected ? "connected" : "notConnected")}
          </Badge>
          {!q.data.connected && <p className="text-sm text-muted-foreground">{t("googleHint")}</p>}
        </div>
      )}
    </DashCard>
  );
}

function CharactersCard() {
  const t = useTranslations("dashboard");
  const q = useQuery({ queryKey: CHARACTERS_KEY, queryFn: listCharacters });
  return (
    <DashCard title={t("characters")} href="/characters" linkLabel={t("open")}>
      {q.isPending ? (
        <CardSkeleton />
      ) : q.isError ? (
        <QueryError error={q.error} fallback={t("loadError")} onRetry={() => void q.refetch()} />
      ) : (
        <p className="text-2xl font-semibold tabular-nums">{q.data.length}</p>
      )}
    </DashCard>
  );
}

export function DashboardView() {
  const t = useTranslations("dashboard");
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <BalanceCard />
        <MonthCard />
        <EventsCard />
        <EmailsCard />
        <GoogleCard />
        <CharactersCard />
      </div>
    </div>
  );
}
