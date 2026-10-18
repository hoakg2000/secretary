"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import { textToSpeech } from "@/lib/api/endpoints/chat";

export type TtsState = "idle" | "loading" | "playing";

/** One shared audio element: starting another message replaces the current one, clicking the same one stops it. */
export function useTtsPlayer(fallbackError: string) {
  const [active, setActive] = useState<{ id: string; state: Exclude<TtsState, "idle"> } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const tokenRef = useRef(0); // ignores a fetch that finished after the user moved on

  const stop = useCallback(() => {
    tokenRef.current++;
    audioRef.current?.pause();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setActive(null);
  }, []);

  useEffect(() => stop, [stop]);

  const toggle = useCallback(
    async (messageId: string) => {
      if (active?.id === messageId) return stop();
      stop();
      const token = tokenRef.current;
      setActive({ id: messageId, state: "loading" });
      try {
        const url = URL.createObjectURL(await textToSpeech(messageId));
        if (token !== tokenRef.current) return URL.revokeObjectURL(url);
        urlRef.current = url;
        const audio = (audioRef.current ??= new Audio());
        audio.onended = stop;
        audio.onerror = stop;
        audio.src = url;
        await audio.play();
        if (token === tokenRef.current) setActive({ id: messageId, state: "playing" });
      } catch (error) {
        if (token !== tokenRef.current) return;
        stop();
        toast.error(error instanceof ApiError ? error.message : fallbackError);
      }
    },
    [active, stop, fallbackError],
  );

  const stateOf = (messageId: string): TtsState => (active?.id === messageId ? active.state : "idle");
  return { toggle, stateOf };
}
