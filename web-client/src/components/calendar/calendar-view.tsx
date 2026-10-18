"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/components/chat/error-message";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { listEvents, syncCalendar } from "@/lib/api/endpoints/calendar";
import type { CalendarEvent } from "@/lib/api/types";
import {
  buildMonthGrid,
  eventsOnDay,
  formatTime,
  shiftMonth,
  todayKey,
} from "@/lib/calendar/helpers";
import { CALENDAR_KEY, calendarMonthKey } from "@/lib/calendar/keys";
import { cn } from "@/lib/utils";
import { EventDialog, type EventDialogState } from "./event-dialog";
import { SyncBadge } from "./sync-badge";

const MAX_CHIPS = 3;

const keyToDate = (key: string) => new Date(`${key}T00:00:00Z`);

export function CalendarView() {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const today = todayKey();
  const [cursor, setCursor] = useState(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  }));
  const [dialog, setDialog] = useState<EventDialogState | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const query = useQuery({
    queryKey: calendarMonthKey(cursor.year, cursor.month),
    queryFn: () => listEvents(cursor),
  });

  const sync = useMutation({
    mutationFn: syncCalendar,
    onSuccess: (result) => {
      if (!result) {
        toast.info(
          <span>
            {t("syncNull")}{" "}
            <Link href="/settings" className="font-medium underline underline-offset-4">
              {t("openSettings")}
            </Link>
          </span>,
        );
        return;
      }
      toast.success(t("syncDone", result));
      void queryClient.invalidateQueries({ queryKey: CALENDAR_KEY });
    },
    onError: (e) => toast.error(errorMessage(e, t("syncError"))),
  });

  const grid = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);
  const events = useMemo(() => query.data ?? [], [query.data]);
  const days = useMemo(
    () => grid.flat().filter((d) => d.inMonth).map((d) => ({ key: d.key, events: eventsOnDay(events, d.key) })),
    [grid, events],
  );

  const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" });
  const monthTitle = fmt({ month: "long", year: "numeric" }).format(Date.UTC(cursor.year, cursor.month - 1, 1));
  // 2024-01-01 is a Monday
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    fmt({ weekday: "short" }).format(Date.UTC(2024, 0, 1 + i)),
  );
  const go = (delta: number) => {
    setExpanded(null);
    setCursor((c) => shiftMonth(c.year, c.month, delta));
  };
  const dayLabel = (key: string) => fmt({ dateStyle: "full" }).format(keyToDate(key));

  const chip = (e: CalendarEvent) => (
    <button
      key={e.id}
      type="button"
      onClick={(ev) => {
        ev.stopPropagation();
        setDialog({ event: e });
      }}
      className="flex w-full items-center gap-1 truncate rounded bg-primary/10 px-1.5 py-0.5 text-left text-xs outline-none hover:bg-primary/20 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="shrink-0 font-medium tabular-nums">{formatTime(e.startTime)}</span>
      <span className="truncate">{e.title}</span>
    </button>
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold capitalize" aria-live="polite">
          {monthTitle}
        </h1>
        <Button variant="outline" size="icon" aria-label={t("prevMonth")} onClick={() => go(-1)}>
          <ChevronLeft aria-hidden />
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setExpanded(null);
            setCursor({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) });
          }}
        >
          {t("today")}
        </Button>
        <Button variant="outline" size="icon" aria-label={t("nextMonth")} onClick={() => go(1)}>
          <ChevronRight aria-hidden />
        </Button>
        <Button variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
          <RefreshCw aria-hidden className={sync.isPending ? "animate-spin" : undefined} />
          {sync.isPending ? t("syncing") : t("syncNow")}
        </Button>
        <Button onClick={() => setDialog({ day: today })}>
          <Plus aria-hidden />
          {t("newEvent")}
        </Button>
      </div>

      {query.isPending ? (
        <div aria-busy="true" className="grid grid-cols-1 gap-2 md:grid-cols-7">
          {Array.from({ length: 7 * 5 }, (_, i) => (
            <Skeleton key={i} className={cn("h-24", i > 3 && "max-md:hidden")} />
          ))}
        </div>
      ) : query.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-sm text-destructive">
          {errorMessage(query.error, t("loadError"))}
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t("retry")}
          </Button>
        </div>
      ) : (
        <>
          {/* md+: month grid */}
          <div className="hidden md:block">
            <div className="grid grid-cols-7 border-l border-t text-center text-xs font-medium text-muted-foreground">
              {weekdays.map((w) => (
                <div key={w} className="border-b border-r py-1.5 capitalize">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 border-l">
              {grid.flat().map((d) => {
                const dayEvents = eventsOnDay(events, d.key);
                const isExpanded = expanded === d.key;
                const shown = isExpanded ? dayEvents : dayEvents.slice(0, MAX_CHIPS);
                const more = dayEvents.length - shown.length;
                return (
                  <div
                    key={d.key}
                    onClick={() => setDialog({ day: d.key })}
                    className={cn(
                      "flex min-h-28 cursor-pointer flex-col gap-1 border-b border-r p-1",
                      !d.inMonth && "bg-muted/40 text-muted-foreground",
                    )}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDialog({ day: d.key });
                      }}
                      aria-label={t("addOnDay", { date: dayLabel(d.key) })}
                      aria-current={d.key === today ? "date" : undefined}
                      className={cn(
                        "flex size-6 items-center justify-center self-start rounded-full text-xs outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                        d.key === today && "bg-primary text-primary-foreground hover:bg-primary",
                      )}
                    >
                      {Number(d.key.slice(8))}
                    </button>
                    {shown.map(chip)}
                    {more > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpanded(d.key);
                        }}
                        className="rounded px-1.5 text-left text-xs text-muted-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {t("more", { count: more })}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* below md: events grouped by day */}
          <div className="md:hidden">
            {days.every((d) => d.events.length === 0) ? (
              <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                {t("empty")}
              </p>
            ) : (
              <ul className="flex flex-col gap-4">
                {days
                  .filter((d) => d.events.length > 0)
                  .map((d) => (
                    <li key={d.key}>
                      <h2 className={cn("mb-1 text-sm font-medium", d.key === today && "text-primary")}>
                        {dayLabel(d.key)}
                      </h2>
                      <ul className="flex flex-col gap-1">
                        {d.events.map((e) => (
                          <li key={e.id}>
                            <button
                              type="button"
                              onClick={() => setDialog({ event: e })}
                              className="flex w-full items-center gap-3 rounded-lg border p-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                            >
                              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                {formatTime(e.startTime)}–{formatTime(e.endTime)}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-sm">{e.title}</span>
                              {e.syncState && <SyncBadge status={e.syncState.syncStatus} />}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          {events.length === 0 && <p className="hidden text-center text-sm text-muted-foreground md:block">{t("empty")}</p>}
        </>
      )}

      <EventDialog state={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}
