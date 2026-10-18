"use client";

import { SendHorizontal, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function Composer({
  streaming,
  disabled,
  onSend,
  onStop,
}: {
  streaming: boolean;
  /** e.g. no character chosen yet */
  disabled?: boolean;
  /** Resolves false when the text was not accepted and should stay in the box. */
  onSend: (text: string) => Promise<boolean>;
  onStop: () => void;
}) {
  const t = useTranslations("chat");
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  // a disabled textarea drops focus; give it back when the reply ends
  const wasStreaming = useRef(false);
  useEffect(() => {
    if (wasStreaming.current && !streaming) ref.current?.focus();
    wasStreaming.current = streaming;
  }, [streaming]);

  const submit = () => {
    const value = text.trim();
    if (!value || streaming || disabled) return;
    setText("");
    // keep the typed text when the request was rejected before streaming
    void onSend(value).then((ok) => {
      if (!ok) setText((cur) => cur || value);
    });
  };

  return (
    <form
      className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-2xl border bg-background p-2 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Textarea
        ref={ref}
        rows={1}
        value={text}
        disabled={streaming || disabled}
        aria-label={t("messageLabel")}
        placeholder={t("placeholder")}
        className="max-h-[200px] min-h-9 resize-none border-0 shadow-none focus-visible:ring-0"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
      />
      {streaming ? (
        <Button type="button" size="icon" variant="outline" aria-label={t("stop")} onClick={onStop}>
          <Square aria-hidden />
        </Button>
      ) : (
        <Button type="submit" size="icon" aria-label={t("send")} disabled={!text.trim() || disabled}>
          <SendHorizontal aria-hidden />
        </Button>
      )}
    </form>
  );
}
