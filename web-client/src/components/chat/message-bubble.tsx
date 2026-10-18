"use client";

import { AlertCircle, ChevronRight, Languages, Loader2, RotateCcw, Square, Volume2, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { TtsState } from "@/lib/chat/use-tts-player";
import { cn } from "@/lib/utils";
import { CharacterAvatar } from "./character-picker";

export interface ToolChipData {
  tool: string;
  args?: unknown;
  result?: unknown;
  error?: string;
  running?: boolean;
}

export interface TtsProps {
  /** Why the button is disabled, or null when it can be used. */
  disabledReason: string | null;
  state: TtsState;
  onToggle: () => void;
}

const pretty = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v, null, 2));

export function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-60 overflow-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap break-words">
      {pretty(value) ?? "—"}
    </pre>
  );
}

export function ToolChip({ chip }: { chip: ToolChipData }) {
  const t = useTranslations("chat");
  return (
    <Collapsible className="w-full max-w-md text-xs">
      <CollapsibleTrigger className="group flex max-w-full items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
        <ChevronRight className="size-3 shrink-0 transition-transform group-data-panel-open:rotate-90" aria-hidden />
        {chip.running ? (
          <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden />
        ) : (
          <Wrench className={cn("size-3 shrink-0", chip.error && "text-destructive")} aria-hidden />
        )}
        <span className="truncate font-mono">{chip.tool}</span>
        <span className="sr-only">{chip.running ? t("toolRunning") : chip.error ? t("toolFailed") : t("toolDone")}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 flex flex-col gap-1 pl-2">
        {chip.args !== undefined && (
          <>
            <span className="text-muted-foreground">{t("toolArgs")}</span>
            <JsonBlock value={chip.args} />
          </>
        )}
        {(chip.result !== undefined || chip.error) && (
          <>
            <span className="text-muted-foreground">{t("toolResult")}</span>
            <JsonBlock value={chip.error ?? chip.result} />
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

const MARKDOWN_CLASS =
  "break-words [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_p:not(:first-child)]:mt-2 [&_pre]:mt-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:list-disc [&_ul]:pl-5";

// Memoized: the live bubble re-renders on every text frame, finished bubbles must not.
const Markdown = memo(function Markdown({ children }: { children: string }) {
  return (
    <div className={MARKDOWN_CLASS}>
      <ReactMarkdown
        components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer noopener">{children}</a> }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});

export function TtsButton({ tts }: { tts: TtsProps }) {
  const t = useTranslations("chat");
  const disabled = tts.disabledReason !== null;
  const label = tts.state === "playing" ? t("ttsStop") : tts.state === "loading" ? t("ttsLoading") : t("ttsPlay");
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            aria-disabled={disabled || undefined}
            className={cn(disabled && "opacity-50")}
            onClick={() => !disabled && tts.onToggle()}
          />
        }
      >
        {tts.state === "loading" ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : tts.state === "playing" ? (
          <Square aria-hidden />
        ) : (
          <Volume2 aria-hidden />
        )}
      </TooltipTrigger>
      <TooltipContent>{tts.disabledReason ?? label}</TooltipContent>
    </Tooltip>
  );
}

export function UserBubble({ children }: { children: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2 text-primary-foreground whitespace-pre-wrap break-words sm:max-w-[75%]">
        {children}
      </div>
    </div>
  );
}

export function ModelBubble({
  characterName,
  content,
  contentJp,
  chips,
  streaming,
  stopped,
  error,
  onRetry,
  tts,
}: {
  characterName: string;
  content: string;
  contentJp?: string | null;
  chips: ToolChipData[];
  streaming?: boolean;
  stopped?: boolean;
  error?: string;
  onRetry?: () => void;
  tts?: TtsProps;
}) {
  const t = useTranslations("chat");
  const [showJp, setShowJp] = useState(false);
  const hasJp = !!contentJp?.trim();

  return (
    <div className="flex gap-3">
      <CharacterAvatar name={characterName} />
      <div className="flex min-w-0 max-w-[90%] flex-1 flex-col items-start gap-2">
        <span className="text-xs font-medium text-muted-foreground">{characterName}</span>
        {chips.length > 0 && (
          <div className="flex w-full flex-col items-start gap-1">
            {chips.map((c, i) => (
              <ToolChip key={i} chip={c} />
            ))}
          </div>
        )}
        {(content || streaming) && (
          <div className="w-full rounded-2xl rounded-tl-md bg-muted px-4 py-2">
            {content ? <Markdown>{content}</Markdown> : <span className="sr-only">{t("thinking")}</span>}
            {streaming && !content && (
              <span aria-hidden className="inline-flex gap-1 py-1">
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
              </span>
            )}
          </div>
        )}
        {showJp && hasJp && (
          <p lang="ja" className="w-full rounded-lg border px-3 py-2 text-sm whitespace-pre-wrap">
            {contentJp}
          </p>
        )}
        {stopped && <span className="text-xs text-muted-foreground italic">{t("stopped")}</span>}
        {error && (
          <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">{error}</span>
            {onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RotateCcw aria-hidden />
                {t("retry")}
              </Button>
            )}
          </div>
        )}
        {tts && !streaming && (
          <div className="flex items-center gap-1">
            <TtsButton tts={tts} />
            {hasJp && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("toggleJp")}
                aria-pressed={showJp}
                onClick={() => setShowJp((v) => !v)}
              >
                <Languages aria-hidden />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
