"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { errorMessage } from "@/components/chat/error-message";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listEmailLogs } from "@/lib/api/endpoints/email";
import type { EmailStatus } from "@/lib/api/types";
import { EMAIL_LOGS_KEY } from "@/lib/emails/keys";
import { formatDateTime } from "@/lib/format";
import { EmailLogSheet } from "./email-log-sheet";
import { EMAIL_STATUSES, EmailStatusBadge } from "./email-status-badge";
import { IngestDialog } from "./ingest-dialog";

const PAGE_SIZE = 20;

export function EmailLogs() {
  const t = useTranslations("emails");
  const locale = useLocale();
  const [status, setStatus] = useState<EmailStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [ingestOpen, setIngestOpen] = useState(false);

  const query = useQuery({
    queryKey: [...EMAIL_LOGS_KEY, status, page],
    queryFn: () => listEmailLogs({ page, pageSize: PAGE_SIZE, status: status === "all" ? undefined : status }),
    placeholderData: keepPreviousData,
  });

  const filterItems = [
    { value: "all", label: t("status.all") },
    ...EMAIL_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
  ];
  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / query.data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span id="email-status-filter" className="text-sm text-muted-foreground">
            {t("filterStatus")}
          </span>
          <Select
            items={filterItems}
            value={status}
            onValueChange={(v) => {
              setStatus((v ?? "all") as EmailStatus | "all");
              setPage(1);
            }}
          >
            <SelectTrigger aria-labelledby="email-status-filter" className="w-40">
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
        <Button variant="outline" onClick={() => setIngestOpen(true)}>
          <Plus aria-hidden />
          {t("ingest")}
        </Button>
      </div>

      {query.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      ) : query.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-sm text-destructive">
          {errorMessage(query.error, t("logsError"))}
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t("retry")}
          </Button>
        </div>
      ) : query.data.items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("logsEmpty")}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("sender")}</TableHead>
                  <TableHead>{t("subject")}</TableHead>
                  <TableHead>{t("status.label")}</TableHead>
                  <TableHead>{t("received")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("summary")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.items.map((log) => (
                  <TableRow key={log.id} className="cursor-pointer" onClick={() => setOpenId(log.id)}>
                    <TableCell className="max-w-48 truncate">{log.sender}</TableCell>
                    <TableCell className="max-w-56">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenId(log.id);
                        }}
                        className="block max-w-full truncate rounded text-left underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {log.subject ?? t("noSubject")}
                      </button>
                    </TableCell>
                    <TableCell>
                      <EmailStatusBadge status={log.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(log.createdAt, locale)}</TableCell>
                    <TableCell className="hidden max-w-72 truncate text-muted-foreground lg:table-cell">
                      {log.aiSummary ?? ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <nav aria-label={t("pagination")} className="flex items-center justify-end gap-2">
            <span className="text-sm text-muted-foreground">{t("pageOf", { page, total: totalPages })}</span>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={t("prevPage")}
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft aria-hidden />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={t("nextPage")}
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight aria-hidden />
            </Button>
          </nav>
        </>
      )}

      <EmailLogSheet id={openId} onClose={() => setOpenId(null)} />
      <IngestDialog open={ingestOpen} onOpenChange={setIngestOpen} />
    </div>
  );
}
