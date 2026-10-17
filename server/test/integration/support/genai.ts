export const EMBEDDING_DIMENSIONS = 1536;

export const httpError = (status: number) =>
  Object.assign(new Error(`HTTP ${status}`), { status });

// Chat stream chunks
export const text = (value: string) => ({
  candidates: [{ content: { parts: [{ text: value }] } }],
});

/** The JSON text the model returns for a chat round */
export const replyJson = (vi: string, jp: string) => JSON.stringify({ message_vi: vi, message_jp: jp });
/** Raw text cut into stream chunks of `size` code units (may cut inside an escape on purpose) */
export const chunkBySize = (raw: string, size: number) =>
  Array.from({ length: Math.ceil(raw.length / size) }, (_, i) => text(raw.slice(i * size, (i + 1) * size)));
/** Raw text cut into stream chunks at the given indexes */
export const chunkAt = (raw: string, ...cuts: number[]) =>
  [0, ...cuts].map((from, i) => text(raw.slice(from, cuts[i] ?? raw.length)));
/** One model round: a single chunk with the JSON reply */
export const reply = (vi: string, jp = 'jp') => [text(replyJson(vi, jp))];
export const calls = (...functionCalls: any[]) => ({ functionCalls });

/** generateContent answer for EmailAiService: the model replies with a JSON string in `text` */
export const classification = (result: Record<string, unknown>) => ({
  text: JSON.stringify({ urgent: false, ...result }),
});

/**
 * Scripted stand-in for GenAiProvider (the @google/genai client).
 * - embedContent: one-hot vector, axis taken from `axes` (unknown text -> axis 0)
 * - generateContent: vi.fn, script it with mockResolvedValueOnce / mockRejectedValueOnce
 * - chats.create().sendMessageStream: consumes `script` (one array of chunks per model round)
 */
export function createFakeGenAi() {
  /** text -> axis of its one-hot embedding */
  const axes = new Map<string, number>();
  /** chunks of each model round, consumed in order */
  const script: any[][] = [];

  const embedContent = vi.fn();
  const generateContent = vi.fn();
  const sendMessageStream = vi.fn();
  const create = vi.fn();

  const applyDefaults = () => {
    embedContent.mockImplementation(async ({ contents }: any) => {
      const values = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
      values[axes.get(contents) ?? 0] = 1;
      return { embeddings: [{ values }] };
    });
    generateContent.mockImplementation(async () => {
      throw new Error('unscripted generateContent');
    });
    sendMessageStream.mockImplementation(async (_params: any) => {
      const chunks = script.shift() ?? [text('')];
      return (async function* () {
        yield* chunks;
      })();
    });
    create.mockImplementation((_params: any) => ({ sendMessageStream }));
  };
  applyDefaults();

  return {
    axes,
    script,
    embedContent,
    generateContent,
    sendMessageStream,
    create,
    /** what GenAiProvider.get() returns */
    get: () => ({ models: { embedContent, generateContent }, chats: { create } }),
    reset() {
      axes.clear();
      script.length = 0;
      for (const fn of [embedContent, generateContent, sendMessageStream, create]) fn.mockReset();
      applyDefaults();
    },
  };
}

export type FakeGenAi = ReturnType<typeof createFakeGenAi>;
