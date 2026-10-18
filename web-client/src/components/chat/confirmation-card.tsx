"use client";

import { Check, Loader2, ShieldQuestion, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatCountdown, remainingMs } from "@/lib/chat/helpers";
import type { PendingAction } from "@/lib/chat/live";
import { JsonBlock } from "./message-bubble";

function useRemaining(receivedAt: number, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return remainingMs(receivedAt, now);
}

export function ConfirmationCard({
  action,
  onConfirm,
  onDiscard,
  onExpire,
}: {
  action: PendingAction;
  onConfirm: () => void;
  onDiscard: () => void;
  onExpire: () => void;
}) {
  const t = useTranslations("chat");
  const waiting = action.state === "pending" || action.state === "failed";
  const left = useRemaining(action.receivedAt, waiting);
  const expired = action.state === "expired" || (waiting && left === 0);

  useEffect(() => {
    if (waiting && left === 0) onExpire();
  }, [waiting, left, onExpire]);

  const busy = action.state === "confirming";
  const locked = busy || !waiting || expired;

  return (
    <section aria-label={t("confirmTitle")} className="ml-12 max-w-md rounded-xl border bg-card p-3 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <ShieldQuestion className="size-4 shrink-0" aria-hidden />
        <span>{t("confirmTitle")}</span>
        <span className="font-mono text-xs text-muted-foreground">{action.tool}</span>
        {waiting && !expired && (
          <span className="ml-auto text-xs tabular-nums text-muted-foreground" aria-label={t("expiresIn")}>
            {formatCountdown(left)}
          </span>
        )}
      </div>
      <div className="mt-2">
        <JsonBlock value={action.args} />
      </div>
      {action.state === "confirmed" && (
        <div role="status" className="mt-2 flex flex-col gap-1">
          <span className="flex items-center gap-1 text-xs font-medium">
            <Check className="size-3" aria-hidden />
            {t("confirmed")}
          </span>
          <JsonBlock value={action.result} />
        </div>
      )}
      {action.state === "discarded" && <p className="mt-2 text-xs text-muted-foreground">{t("discarded")}</p>}
      {expired && <p className="mt-2 text-xs text-destructive">{t("expired")}</p>}
      {action.state === "failed" && !expired && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {typeof action.result === "string" ? action.result : t("confirmError")}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <Button size="sm" disabled={locked} onClick={onConfirm}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
          {t("confirm")}
        </Button>
        <Button size="sm" variant="outline" disabled={locked} onClick={onDiscard}>
          <X aria-hidden />
          {t("discard")}
        </Button>
      </div>
    </section>
  );
}
