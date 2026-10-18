"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { errorMessage } from "@/components/chat/error-message";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { getEmailLog, reprocessEmailLog } from "@/lib/api/endpoints/email";
import { CALENDAR_KEY } from "@/lib/calendar/keys";
import { EMAIL_LOGS_KEY, emailLogKey } from "@/lib/emails/keys";
import { FINANCE_KEY } from "@/lib/finance/keys";
import { formatDateTime } from "@/lib/format";
import { EmailStatusBadge } from "./email-status-badge";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm">{children}</dd>
    </div>
  );
}

/** Detail drawer for one email log. `id` null = closed. */
export function EmailLogSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useTranslations("emails");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: emailLogKey(id ?? ""), queryFn: () => getEmailLog(id!), enabled: !!id });

  const reprocess = useMutation({
    mutationFn: () => reprocessEmailLog(id!),
    onSuccess: () => {
      toast.success(t("reprocessed"));
      void queryClient.invalidateQueries({ queryKey: EMAIL_LOGS_KEY });
      void queryClient.invalidateQueries({ queryKey: emailLogKey(id!) });
      // a reprocessed email can create a transaction or event
      void queryClient.invalidateQueries({ queryKey: FINANCE_KEY });
      void queryClient.invalidateQueries({ queryKey: CALENDAR_KEY });
    },
    onError: (e) => toast.error(errorMessage(e, t("reprocessError"))),
  });

  const log = query.data;
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="data-[side=right]:sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t("detailTitle")}</SheetTitle>
          <SheetDescription>{log?.subject ?? t("noSubject")}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4">
          {query.isPending ? (
            <div className="flex flex-col gap-3" aria-busy="true">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-32" />
            </div>
          ) : query.isError ? (
            <div role="alert" className="flex flex-col items-start gap-2 text-sm text-destructive">
              {errorMessage(query.error, t("detailError"))}
              <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                {t("retry")}
              </Button>
            </div>
          ) : (
            <dl className="flex flex-col gap-4">
              <Field label={t("status.label")}>
                <EmailStatusBadge status={log!.status} />
              </Field>
              <Field label={t("sender")}>{log!.sender}</Field>
              <Field label={t("subject")}>{log!.subject ?? t("noSubject")}</Field>
              <Field label={t("received")}>{formatDateTime(log!.createdAt, locale)}</Field>
              <Field label={t("summary")}>{log!.aiSummary ?? t("noSummary")}</Field>
              <Field label={t("rawBody")}>
                {log!.rawBody ? (
                  <pre className="max-h-80 overflow-auto rounded-lg border bg-muted/50 p-3 text-xs whitespace-pre-wrap break-words">
                    {log!.rawBody}
                  </pre>
                ) : (
                  <span className="text-muted-foreground">{t("noBody")}</span>
                )}
              </Field>
            </dl>
          )}
        </div>
        {log?.status === "FAILED" && (
          <SheetFooter>
            <Button onClick={() => reprocess.mutate()} disabled={reprocess.isPending}>
              <RotateCw aria-hidden className={reprocess.isPending ? "animate-spin" : undefined} />
              {t("reprocess")}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
