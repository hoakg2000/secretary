"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { errorMessage } from "@/components/chat/error-message";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function ListSkeleton({ rows = 4, className = "h-11" }: { rows?: number; className?: string }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={className} />
      ))}
    </div>
  );
}

export function QueryError({ error, fallback, onRetry }: { error: unknown; fallback: string; onRetry: () => void }) {
  const t = useTranslations("common");
  return (
    <div role="alert" className="flex flex-col items-start gap-2 text-sm text-destructive">
      {errorMessage(error, fallback)}
      <Button variant="outline" size="sm" onClick={onRetry}>
        {t("retry")}
      </Button>
    </div>
  );
}

export function EmptyState({ children }: { children: string }) {
  return <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</p>;
}

export function Pager({
  page,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  const t = useTranslations("common");
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav aria-label={t("pagination")} className="flex items-center justify-end gap-2">
      <span className="text-sm text-muted-foreground">{t("pageOf", { page, total: pages })}</span>
      <Button variant="outline" size="icon-sm" aria-label={t("prevPage")} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft aria-hidden />
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={t("nextPage")}
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        <ChevronRight aria-hidden />
      </Button>
    </nav>
  );
}
