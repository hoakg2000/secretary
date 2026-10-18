"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { LanguageSwitch } from "@/components/layout/app-shell";
import { errorMessage } from "@/components/chat/error-message";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField } from "@/components/form-field";
import { QueryError } from "@/components/query-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { usePathname, useRouter } from "@/i18n/navigation";
import { disconnectGoogle, getGoogleConnectUrl, getGoogleStatus, getSession } from "@/lib/api/endpoints/auth";
import { triggerProactive } from "@/lib/api/endpoints/proactive";
import type { ProactiveTriggerResult } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-provider";
import { GOOGLE_STATUS_KEY, SESSION_INFO_KEY } from "@/lib/auth/keys";
import { formatDateTime } from "@/lib/format";

const REASONS = ["missing_code", "invalid_state", "no_token", "exchange_failed"];

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <Card aria-labelledby={id} role="region">
      <CardHeader>
        <CardTitle id={id} className="text-base">
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function GoogleSection() {
  const t = useTranslations("settings");
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const [confirm, setConfirm] = useState(false);
  const handled = useRef(false);

  const status = useQuery({ queryKey: GOOGLE_STATUS_KEY, queryFn: getGoogleStatus });

  // result of the OAuth callback redirect: ?google=connected | error&reason=<code>
  useEffect(() => {
    if (handled.current) return;
    const params = new URLSearchParams(window.location.search);
    const result = params.get("google");
    if (!result) return;
    handled.current = true;
    if (result === "connected") {
      toast.success(t("googleConnectedToast"));
      void queryClient.invalidateQueries({ queryKey: GOOGLE_STATUS_KEY });
    } else if (result === "error") {
      const reason = params.get("reason") ?? "";
      toast.error(REASONS.includes(reason) ? t(`googleReason.${reason}`) : t("googleReason.unknown"));
    }
    router.replace(pathname);
  }, [t, queryClient, router, pathname]);

  const connect = useMutation({
    mutationFn: getGoogleConnectUrl,
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (e) => toast.error(errorMessage(e, t("connectError"))),
  });

  const disconnect = useMutation({
    mutationFn: disconnectGoogle,
    onSuccess: () => {
      toast.success(t("disconnected"));
      void queryClient.invalidateQueries({ queryKey: GOOGLE_STATUS_KEY });
      setConfirm(false);
    },
    onError: (e) => toast.error(errorMessage(e, t("disconnectError"))),
  });

  return (
    <Section id="set-google" title={t("google")} description={t("googleDescription")}>
      {status.isPending ? (
        <Skeleton aria-busy="true" className="h-9 w-48" />
      ) : status.isError ? (
        <QueryError error={status.error} fallback={t("googleStatusError")} onRetry={() => void status.refetch()} />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={status.data.connected ? "default" : "outline"}>
            {t(status.data.connected ? "connected" : "notConnected")}
          </Badge>
          {status.data.connected ? (
            <Button variant="outline" className="text-destructive" onClick={() => setConfirm(true)}>
              {t("disconnect")}
            </Button>
          ) : (
            <Button onClick={() => connect.mutate()} disabled={connect.isPending || connect.isSuccess}>
              {connect.isPending || connect.isSuccess ? t("redirecting") : t("connect")}
            </Button>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        title={t("disconnectTitle")}
        description={t("disconnectDescription")}
        confirmLabel={t("disconnect")}
        pending={disconnect.isPending}
        onConfirm={() => disconnect.mutate()}
        onClose={() => setConfirm(false)}
      />
    </Section>
  );
}

function AccountSection() {
  const t = useTranslations("settings");
  const locale = useLocale();
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const q = useQuery({ queryKey: SESSION_INFO_KEY, queryFn: getSession });

  return (
    <Section id="set-account" title={t("account")} description={t("accountDescription")}>
      {q.isPending ? (
        <Skeleton aria-busy="true" className="h-24 w-full" />
      ) : q.isError ? (
        <QueryError error={q.error} fallback={t("sessionError")} onRetry={() => void q.refetch()} />
      ) : (
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted-foreground">{t("email")}</dt>
          <dd>{q.data.user.email}</dd>
          <dt className="text-muted-foreground">{t("ip")}</dt>
          <dd>{q.data.ipAddress ?? "—"}</dd>
          <dt className="text-muted-foreground">{t("userAgent")}</dt>
          <dd className="break-all">{q.data.userAgent ?? "—"}</dd>
          <dt className="text-muted-foreground">{t("lastActive")}</dt>
          <dd>{formatDateTime(q.data.lastActiveAt, locale)}</dd>
        </dl>
      )}
      <Button
        variant="outline"
        className="mt-4"
        disabled={loggingOut}
        onClick={() => {
          setLoggingOut(true);
          void logout();
        }}
      >
        <LogOut aria-hidden />
        {t("logout")}
      </Button>
    </Section>
  );
}

function TelegramSection() {
  const t = useTranslations("settings");
  const [result, setResult] = useState<ProactiveTriggerResult["result"] | null>(null);
  const schema = useMemo(() => z.object({ message: z.string().trim().min(1, t("messageRequired")) }), [t]);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ message: string }>({ resolver: zodResolver(schema), defaultValues: { message: "" } });

  const send = useMutation({
    mutationFn: (v: { message: string }) => triggerProactive({ type: "CUSTOM", message: v.message.trim() }),
    onMutate: () => setResult(null),
    onSuccess: (data) => setResult(data.result),
    onError: (e) => toast.error(errorMessage(e, t("telegramError"))),
  });

  return (
    <Section id="set-telegram" title={t("telegram")} description={t("telegramDescription")}>
      <form noValidate onSubmit={handleSubmit((v) => send.mutate(v))} className="flex flex-col gap-3">
        <FormField id="tg-message" label={t("telegramMessage")} error={errors.message?.message}>
          <Textarea
            id="tg-message"
            rows={3}
            aria-invalid={!!errors.message}
            aria-describedby={errors.message ? "tg-message-error" : undefined}
            {...register("message")}
          />
        </FormField>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={send.isPending}>
            {send.isPending ? t("sending") : t("telegramSend")}
          </Button>
          <div role="status" aria-live="polite">
            {result && (
              <Badge variant={result.status === "SENT" ? "default" : result.status === "FAILED" ? "destructive" : "secondary"}>
                {t(`telegramStatus.${result.status}`)}
              </Badge>
            )}
          </div>
        </div>
      </form>
    </Section>
  );
}

export function SettingsView() {
  const t = useTranslations("settings");
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <GoogleSection />
      <AccountSection />
      <TelegramSection />
      <Section id="set-language" title={t("language")}>
        <div className="w-56">
          <LanguageSwitch />
        </div>
      </Section>
    </div>
  );
}
