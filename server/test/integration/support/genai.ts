export const EMBEDDING_DIMENSIONS = 1536;

/**
 * Scripted stand-in for GenAiProvider (the @google/genai client), used for embeddings only.
 * - embedContent: one-hot vector, axis taken from `axes` (unknown text -> axis 0)
 */
export function createFakeGenAi() {
  /** text -> axis of its one-hot embedding */
  const axes = new Map<string, number>();

  const embedContent = vi.fn();

  const applyDefaults = () => {
    embedContent.mockImplementation(async ({ contents }: any) => {
      const values = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
      values[axes.get(contents) ?? 0] = 1;
      return { embeddings: [{ values }] };
    });
  };
  applyDefaults();

  return {
    axes,
    embedContent,
    /** what GenAiProvider.get() returns */
    get: () => ({ models: { embedContent } }),
    reset() {
      axes.clear();
      embedContent.mockReset();
      applyDefaults();
    },
  };
}

export type FakeGenAi = ReturnType<typeof createFakeGenAi>;
