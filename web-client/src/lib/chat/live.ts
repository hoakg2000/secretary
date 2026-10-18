import type { ChatFrame } from "@/lib/api/types";

export interface LiveStep {
  tool: string;
  args: unknown;
  result?: unknown;
  hasResult: boolean;
}

/** One optimistic user message plus the model reply being streamed. */
export interface LiveTurn {
  key: string;
  userText: string;
  text: string;
  steps: LiveStep[];
  messageId?: string;
  contentJp?: string | null;
  status: "streaming" | "done" | "error" | "stopped";
  error?: string;
}

export type ActionState = "pending" | "confirming" | "confirmed" | "discarded" | "expired" | "failed";

export interface PendingAction {
  actionId: string;
  tool: string;
  args: unknown;
  receivedAt: number;
  state: ActionState;
  result?: unknown;
}

export const newTurn = (key: string, userText: string): LiveTurn => ({
  key,
  userText,
  text: "",
  steps: [],
  status: "streaming",
});

/** Applies the frames that change the bubble. `session`, `confirmation_required` and `done` are handled by the caller. */
export function applyFrame(turn: LiveTurn, frame: ChatFrame): LiveTurn {
  switch (frame.type) {
    case "text":
      return { ...turn, text: turn.text + frame.content };
    case "tool_call":
      return { ...turn, steps: [...turn.steps, { tool: frame.tool, args: frame.args, hasResult: false }] };
    case "tool_result": {
      const i = turn.steps.findIndex((s) => s.tool === frame.tool && !s.hasResult);
      const steps =
        i >= 0
          ? turn.steps.map((s, j) => (j === i ? { ...s, result: frame.result, hasResult: true } : s))
          : [...turn.steps, { tool: frame.tool, args: undefined, result: frame.result, hasResult: true }];
      return { ...turn, steps };
    }
    case "reply":
      return { ...turn, messageId: frame.messageId, contentJp: frame.contentJp };
    case "error":
      return { ...turn, status: "error", error: frame.message };
    default:
      return turn;
  }
}
