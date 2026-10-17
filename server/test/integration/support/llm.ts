import type { LlmBody, LlmEvent, LlmToolCall, LlmType } from '../../../src/llm/llm.types';

/** One model round: events in order. An Error in the list is thrown when the stream reaches it. */
export type LlmRound = (LlmEvent | Error)[];

export const httpError = (status: number) =>
  Object.assign(new Error(`HTTP ${status}`), { status });

// Events
export const text = (value: string): LlmEvent => ({ type: 'text', text: value });
/** A tool_calls event; a missing id becomes call_<index> */
export const toolCalls = (...calls: (Omit<LlmToolCall, 'id'> & { id?: string })[]): LlmEvent => ({
  type: 'tool_calls',
  calls: calls.map((c, i) => ({ id: `call_${i}`, ...c })),
});

/** The JSON text the model returns for a chat round */
export const replyJson = (vi: string, jp: string) => JSON.stringify({ message_vi: vi, message_jp: jp });
/** Raw text cut into stream chunks of `size` code units (may cut inside an escape on purpose) */
export const chunkBySize = (raw: string, size: number): LlmRound =>
  Array.from({ length: Math.ceil(raw.length / size) }, (_, i) => text(raw.slice(i * size, (i + 1) * size)));
/** Raw text cut into stream chunks at the given indexes */
export const chunkAt = (raw: string, ...cuts: number[]): LlmRound =>
  [0, ...cuts].map((from, i) => text(raw.slice(from, cuts[i] ?? raw.length)));
/** One model round: a single chunk with the JSON reply */
export const reply = (vi: string, jp = 'jp'): LlmRound => [text(replyJson(vi, jp))];
/** One model round for EmailAiService: the model replies with a JSON string */
export const classification = (result: Record<string, unknown>): LlmRound => [
  text(JSON.stringify({ urgent: false, ...result })),
];

/**
 * Scripted stand-in for LlmService (provider-neutral, so switching LLM_TYPE never breaks the specs).
 * - sendMessageLLM: consumes `script` (one round per call); when empty, `answerAll` or an empty round
 * - completeLLM: joins the text of sendMessageLLM, like the real one
 * - calls: every request, in order; the messages array is copied because the agent keeps appending to it
 */
export function createFakeLlm() {
  /** rounds, consumed in order */
  const script: LlmRound[] = [];
  const calls: { type: LlmType; body: LlmBody }[] = [];
  let fallback: LlmRound | undefined;

  const next = (type: LlmType, body: LlmBody) => {
    calls.push({ type, body: { ...body, messages: [...body.messages] } });
    const round = script.shift() ?? fallback ?? [];
    return (async function* () {
      for (const item of round) {
        if (item instanceof Error) throw item;
        yield item;
      }
    })();
  };

  const sendMessageLLM = vi.fn(next);
  const completeLLM = async (type: LlmType, body: LlmBody) => {
    let out = '';
    for await (const ev of sendMessageLLM(type, body)) if (ev.type === 'text') out += ev.text;
    return out;
  };

  return {
    script,
    calls,
    sendMessageLLM,
    completeLLM,
    /** every call without a scripted round gets this round */
    answerAll(round: LlmRound) {
      fallback = round;
    },
    reset() {
      script.length = 0;
      calls.length = 0;
      fallback = undefined;
      sendMessageLLM.mockReset().mockImplementation(next);
    },
  };
}

export type FakeLlm = ReturnType<typeof createFakeLlm>;
