"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/components/chat/error-message";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState, ListSkeleton, Pager, QueryError } from "@/components/query-states";
import { SimpleSelect } from "@/components/simple-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/client";
import { deleteMemory, listMemories, searchMemories } from "@/lib/api/endpoints/memories";
import type { Memory, MemorySearchResult } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { MEMORIES_KEY } from "@/lib/memories/keys";
import { MemoryDialog } from "./memory-dialog";

const PAGE_SIZE = 20;
const ALL = "all";
const SOURCES = ["CHAT", "EMAIL", "MANUAL"];

interface Search {
  query: string;
  limit: number;
  minScore: number;
}

export function MemoriesView() {
  const t = useTranslations("memories");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState("");
  const [source, setSource] = useState(ALL);
  const [filters, setFilters] = useState({ category: "", source: ALL });
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState("");
  const [limit, setLimit] = useState("10");
  const [minScore, setMinScore] = useState("0.5");
  const [search, setSearch] = useState<Search | null>(null);
  const [dialog, setDialog] = useState<{ memory?: Memory } | null>(null);
  const [toDelete, setToDelete] = useState<Memory | null>(null);

  const list = useQuery({
    queryKey: [...MEMORIES_KEY, "list", filters, page],
    queryFn: () =>
      listMemories({
        page,
        pageSize: PAGE_SIZE,
        category: filters.category || undefined,
        source: filters.source === ALL ? undefined : filters.source,
      }),
    placeholderData: keepPreviousData,
    enabled: search === null,
  });

  const results = useQuery({
    queryKey: [...MEMORIES_KEY, "search", search, filters],
    queryFn: () =>
      searchMemories({
        ...search!,
        ...(filters.category && { category: filters.category }),
        ...(filters.source !== ALL && { source: filters.source }),
      }),
    enabled: search !== null,
    retry: false,
  });

  const remove = useMutation({
    mutationFn: (m: Memory) => deleteMemory(m.id),
    onSuccess: () => {
      toast.success(t("deleted"));
      void queryClient.invalidateQueries({ queryKey: MEMORIES_KEY });
      setToDelete(null);
    },
    onError: (e) => toast.error(errorMessage(e, t("deleteError"))),
  });

  const applyFilters = (e: FormEvent) => {
    e.preventDefault();
    setFilters({ category: category.trim(), source });
    setPage(1);
  };
  const runSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = searchText.trim();
    if (!q) return setSearch(null);
    const l = Math.min(20, Math.max(1, Math.trunc(Number(limit)) || 10));
    const m = Math.min(1, Math.max(0, Number(minScore.replace(",", ".")) || 0));
    setSearch({ query: q, limit: l, minScore: m });
  };
  const clearSearch = () => {
    setSearchText("");
    setSearch(null);
  };

  const sourceItems = [{ value: ALL, label: t("allSources") }, ...SOURCES.map((s) => ({ value: s, label: s }))];
  const active = search !== null ? results : list;
  const items: (Memory | MemorySearchResult)[] | undefined = search !== null ? results.data : list.data?.items;
  const unavailable = results.error instanceof ApiError && results.error.status === 503;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <Button onClick={() => setDialog({})}>
          <Plus aria-hidden />
          {t("add")}
        </Button>
      </div>

      <form onSubmit={runSearch} role="search" aria-label={t("searchLabel")} className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-60 flex-1 flex-col gap-1.5">
          <Label htmlFor="mem-search">{t("searchLabel")}</Label>
          <Input
            id="mem-search"
            type="search"
            value={searchText}
            placeholder={t("searchPlaceholder")}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mem-limit">{t("limit")}</Label>
          <Input id="mem-limit" type="number" min={1} max={20} value={limit} onChange={(e) => setLimit(e.target.value)} className="w-24" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mem-min">{t("minScore")}</Label>
          <Input
            id="mem-min"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            className="w-28"
          />
        </div>
        <Button type="submit">
          <Search aria-hidden />
          {t("search")}
        </Button>
        {search && (
          <Button type="button" variant="outline" onClick={clearSearch}>
            <X aria-hidden />
            {t("clearSearch")}
          </Button>
        )}
      </form>

      <form onSubmit={applyFilters} aria-label={t("filters")} className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mem-filter-category">{t("category")}</Label>
          <Input id="mem-filter-category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-44" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label id="mem-filter-source">{t("source")}</Label>
          <SimpleSelect items={sourceItems} value={source} onChange={setSource} labelledBy="mem-filter-source" className="w-36" />
        </div>
        <Button type="submit" variant="outline">
          {t("applyFilters")}
        </Button>
      </form>

      {search && !active.isError && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t("searchingFor", { query: search.query })}
        </p>
      )}

      {active.isPending ? (
        <ListSkeleton rows={4} className="h-20" />
      ) : unavailable ? (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <p className="font-medium text-destructive">{t("unavailableTitle")}</p>
          <p className="mt-1">{errorMessage(results.error, t("unavailableFallback"))}</p>
        </div>
      ) : active.isError ? (
        <QueryError
          error={active.error}
          fallback={t(search ? "searchError" : "loadError")}
          onRetry={() => void active.refetch()}
        />
      ) : !items || items.length === 0 ? (
        <EmptyState>{t(search ? "searchEmpty" : "empty")}</EmptyState>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {items.map((m) => (
              <li key={m.id} className="flex flex-col gap-2 rounded-xl border p-3">
                <p className="whitespace-pre-wrap break-words text-sm">{m.content}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {m.category && <Badge variant="secondary">{m.category}</Badge>}
                  {m.source && <Badge variant="outline">{m.source}</Badge>}
                  <span>{formatDateTime(m.createdAt, locale)}</span>
                  {"finalScore" in m && (
                    <span className="tabular-nums" title={t("scoresHint")}>
                      {t("similarity")} {m.similarity.toFixed(3)} · {t("decayed")} {m.decayedScore.toFixed(3)} ·{" "}
                      <strong className="text-foreground">
                        {t("final")} {m.finalScore.toFixed(3)}
                      </strong>
                    </span>
                  )}
                  <span className="ml-auto flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("editLabel")}
                      onClick={() => setDialog({ memory: m as Memory })}
                    >
                      <Pencil aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive"
                      aria-label={t("deleteLabel")}
                      onClick={() => setToDelete(m as Memory)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {!search && list.data && (
            <Pager page={page} total={list.data.total} pageSize={list.data.pageSize} onPage={setPage} />
          )}
        </>
      )}

      <MemoryDialog open={dialog !== null} memory={dialog?.memory} onOpenChange={(o) => !o && setDialog(null)} />
      <ConfirmDialog
        open={toDelete !== null}
        title={t("deleteTitle")}
        description={t("deleteDescription")}
        confirmLabel={t("delete")}
        pending={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
