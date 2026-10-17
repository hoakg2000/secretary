import { NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListMemoryDto } from '../../src/ai-agent/dto/list-memory.dto';
import { SearchMemoryDto } from '../../src/ai-agent/dto/search-memory.dto';
import { MemoryService } from '../../src/ai-agent/services/memory/memory.service';
import { RagChunkService } from '../../src/ai-agent/services/rag-chunk/rag-chunk.service';
import { MemoryTools } from '../../src/ai-agent/tools/memory.tools';
import {
  MISSING,
  createTestModule,
  EMBEDDING_DIMENSIONS,
  resetState,
  seedAccount,
  type TestContext,
} from './harness';

const DAY = 86_400_000;

/** Embedding with the given weights on the given axes (cosine similarity is then easy to reason about) */
const vector = (...weights: [axis: number, value: number][]) => {
  const values = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  for (const [axis, value] of weights) values[axis] = value;
  return { embeddings: [{ values }] };
};

describe('memory integration', () => {
  let ctx: TestContext;
  let memory: MemoryService;
  let tools: MemoryTools;
  let rag: RagChunkService;

  beforeAll(async () => {
    ctx = await createTestModule();
    memory = ctx.moduleRef.get(MemoryService);
    tools = ctx.moduleRef.get(MemoryTools);
    rag = ctx.moduleRef.get(RagChunkService);
  });

  afterAll(() => ctx.close());

  beforeEach(async () => {
    await resetState(ctx);
    // nothing here enqueues, but keep the real worker away from the queue anyway
    await ctx.queue.pause();
  });

  const row = (id: string) => ctx.prisma.aiMemory.findUniqueOrThrow({ where: { id } });
  const setTimes = (id: string, createdAt: Date, lastAccessedAt: Date) =>
    ctx.prisma.$executeRaw`UPDATE ai_memories SET created_at = ${createdAt}, last_accessed_at = ${lastAccessedAt} WHERE id = ${id}`;
  const sqlInfo = async (id: string, word: string) => {
    const [info] = await ctx.prisma.$queryRaw<{ dims: number | null; hit: boolean | null }[]>`
      SELECT vector_dims(embedding) AS dims, content_tsv @@ plainto_tsquery('simple', ${word}) AS hit
      FROM ai_memories WHERE id = ${id}`;
    return info;
  };
  const withAxes = (axes: Record<string, number>) => {
    for (const [textValue, axis] of Object.entries(axes)) ctx.genAi.axes.set(textValue, axis);
  };

  // ---------------------------------------------------------------- generateEmbedding

  describe('generateEmbedding', () => {
    it('returns a 1536-dimension vector', async () => {
      const result = await memory.generateEmbedding('hello', 'RETRIEVAL_DOCUMENT');

      expect(result).toHaveLength(EMBEDDING_DIMENSIONS);
    });

    it('passes the model, the text, the dimensionality and the task type to Gemini', async () => {
      await memory.generateEmbedding('where is my key', 'RETRIEVAL_QUERY');

      expect(ctx.genAi.embedContent).toHaveBeenCalledWith({
        model: 'test-embedding-model',
        contents: 'where is my key',
        config: { outputDimensionality: 1536, taskType: 'RETRIEVAL_QUERY' },
      });
    });

    it('rejects an embedding with the wrong length', async () => {
      ctx.genAi.embedContent.mockResolvedValueOnce({ embeddings: [{ values: [1, 2, 3] }] });

      await expect(memory.generateEmbedding('x', 'RETRIEVAL_DOCUMENT')).rejects.toThrow(/1536/);
    });

    it('rejects a response without embeddings', async () => {
      ctx.genAi.embedContent.mockResolvedValueOnce({});

      await expect(memory.generateEmbedding('x', 'RETRIEVAL_DOCUMENT')).rejects.toThrow(/1536/);
    });
  });

  // ---------------------------------------------------------------- saveMemory

  describe('saveMemory', () => {
    it('writes the embedding (1536 dims) and the tsvector with raw SQL', async () => {
      const saved = await memory.saveMemory({ content: 'I drink coffee every morning' });

      const info = await sqlInfo(saved.id, 'coffee');
      expect(info.dims).toBe(EMBEDDING_DIMENSIONS);
      expect(info.hit).toBe(true);
      expect((await sqlInfo(saved.id, 'tea')).hit).toBe(false);
    });

    it('embeds the content as a document', async () => {
      await memory.saveMemory({ content: 'doc text' });

      expect(ctx.genAi.embedContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: 'doc text',
          config: expect.objectContaining({ taskType: 'RETRIEVAL_DOCUMENT' }),
        }),
      );
    });

    it('defaults to category GENERAL, source MANUAL, score 1 and decay 0.01', async () => {
      const saved = await memory.saveMemory({ content: 'plain' });

      expect(await row(saved.id)).toMatchObject({
        category: 'GENERAL',
        source: 'MANUAL',
        initialScore: 1,
        decayFactor: 0.01,
      });
    });

    it('stores the given category, source, score and decay', async () => {
      const saved = await memory.saveMemory({
        content: 'custom',
        category: 'FACT',
        source: 'EMAIL',
        initialScore: 2.5,
        decayFactor: 0.2,
      });

      expect(await row(saved.id)).toMatchObject({
        category: 'FACT',
        source: 'EMAIL',
        initialScore: 2.5,
        decayFactor: 0.2,
      });
    });

    it('writes nothing when the embedding call fails', async () => {
      ctx.genAi.embedContent.mockRejectedValueOnce(new Error('embedding down'));

      await expect(memory.saveMemory({ content: 'lost' })).rejects.toThrow('embedding down');

      expect(await ctx.prisma.aiMemory.count()).toBe(0);
    });

    it('writes nothing when the embedding has the wrong length', async () => {
      ctx.genAi.embedContent.mockResolvedValueOnce({ embeddings: [{ values: [1] }] });

      await expect(memory.saveMemory({ content: 'lost' })).rejects.toThrow(/1536/);

      expect(await ctx.prisma.aiMemory.count()).toBe(0);
    });
  });

  // ---------------------------------------------------------------- searchMemory

  describe('searchMemory', () => {
    it('finds the memory with the closest vector and reports its similarity', async () => {
      withAxes({ 'likes tea': 1, 'likes dogs': 2, 'what drink': 1 });
      const tea = await memory.saveMemory({ content: 'likes tea' });
      await memory.saveMemory({ content: 'likes dogs' });

      const results = await memory.searchMemory({ query: 'what drink' });

      expect(results.map((r) => r.id)).toEqual([tea.id]);
      expect(Number(results[0].similarity)).toBeCloseTo(1, 5);
      expect(results[0]).toMatchObject({ content: 'likes tea', category: 'GENERAL', source: 'MANUAL' });
    });

    it('embeds the query as a query', async () => {
      await memory.searchMemory({ query: 'q text' });

      expect(ctx.genAi.embedContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: 'q text',
          config: expect.objectContaining({ taskType: 'RETRIEVAL_QUERY' }),
        }),
      );
    });

    it('returns nothing when no memory is stored', async () => {
      expect(await memory.searchMemory({ query: 'anything' })).toEqual([]);
    });

    it('ignores a row without embedding', async () => {
      await ctx.prisma.aiMemory.create({ data: { content: 'no vector' } });

      expect(await memory.searchMemory({ query: 'no vector' })).toEqual([]);
    });

    describe('minScore (cosine similarity threshold)', () => {
      beforeEach(async () => {
        withAxes({ exact: 1, half: 2, far: 3, probe: 1 });
        await memory.saveMemory({ content: 'exact' });
        // cosine similarity with axis 1 = 1 / sqrt(2) = 0.707
        ctx.genAi.embedContent.mockResolvedValueOnce(vector([1, 1], [2, 1]));
        await memory.saveMemory({ content: 'half' });
        await memory.saveMemory({ content: 'far' });
      });

      it('uses 0.5 by default', async () => {
        const results = await memory.searchMemory({ query: 'probe' });

        expect(results.map((r) => r.content).sort()).toEqual(['exact', 'half']);
      });

      it('drops memories below a higher threshold', async () => {
        const results = await memory.searchMemory({ query: 'probe', minScore: 0.9 });

        expect(results.map((r) => r.content)).toEqual(['exact']);
      });

      it('returns everything with threshold 0', async () => {
        const results = await memory.searchMemory({ query: 'probe', minScore: 0 });

        expect(results).toHaveLength(3);
      });

      it('returns nothing for a threshold nothing reaches', async () => {
        withAxes({ unrelated: 9 });

        expect(await memory.searchMemory({ query: 'unrelated', minScore: 0.5 })).toEqual([]);
      });
    });

    it('ranks the memory containing the query words first when vectors are equal (FTS part)', async () => {
      withAxes({ 'I like banana': 5, 'I like apple': 5, banana: 5 });
      await memory.saveMemory({ content: 'I like apple' });
      const banana = await memory.saveMemory({ content: 'I like banana' });

      const results = await memory.searchMemory({ query: 'banana' });

      expect(results.map((r) => r.id)[0]).toBe(banana.id);
      expect(Number(results[0].finalScore)).toBeGreaterThan(Number(results[1].finalScore));
    });

    it('filters by category', async () => {
      withAxes({ a: 1, b: 1, probe: 1 });
      const fact = await memory.saveMemory({ content: 'a', category: 'FACT' });
      await memory.saveMemory({ content: 'b', category: 'EVENT' });

      const results = await memory.searchMemory({ query: 'probe', category: 'FACT' });

      expect(results.map((r) => r.id)).toEqual([fact.id]);
    });

    it('filters by source', async () => {
      withAxes({ a: 1, b: 1, probe: 1 });
      await memory.saveMemory({ content: 'a', source: 'EMAIL' });
      const chat = await memory.saveMemory({ content: 'b', source: 'CHAT' });

      const results = await memory.searchMemory({ query: 'probe', source: 'CHAT' });

      expect(results.map((r) => r.id)).toEqual([chat.id]);
    });

    it('caps the result at the limit', async () => {
      withAxes({ a: 1, b: 1, c: 1, probe: 1 });
      for (const content of ['a', 'b', 'c']) await memory.saveMemory({ content });

      expect(await memory.searchMemory({ query: 'probe', limit: 2 })).toHaveLength(2);
      expect(await memory.searchMemory({ query: 'probe', limit: 1 })).toHaveLength(1);
    });

    it('returns 5 results by default', async () => {
      withAxes({ probe: 1 });
      for (let i = 0; i < 6; i++) {
        withAxes({ [`m${i}`]: 1 });
        await memory.saveMemory({ content: `m${i}` });
      }

      expect(await memory.searchMemory({ query: 'probe' })).toHaveLength(5);
    });

    it('ranks a recently accessed memory above an old one with equal similarity (decay at query time)', async () => {
      withAxes({ 'alpha old': 1, 'alpha recent': 1, alpha: 1 });
      const old = await memory.saveMemory({ content: 'alpha old' });
      const recent = await memory.saveMemory({ content: 'alpha recent' });
      const now = Date.now();
      await setTimes(old.id, new Date(now - 200 * DAY), new Date(now - 100 * DAY));
      await setTimes(recent.id, new Date(now - 200 * DAY), new Date(now));

      const results = await memory.searchMemory({ query: 'alpha' });

      expect(results.map((r) => r.id)).toEqual([recent.id, old.id]);
      expect(Number(results[0].decayedScore)).toBeGreaterThan(Number(results[1].decayedScore));
      // S0 * e^(-lambda * t) with lambda 0.01 and t about 100 days
      expect(Number(results[1].decayedScore)).toBeCloseTo(Math.exp(-1), 2);
    });

    it('a higher initial score outranks a lower one with equal similarity and age', async () => {
      withAxes({ 'beta low': 1, 'beta high': 1, beta: 1 });
      await memory.saveMemory({ content: 'beta low', initialScore: 1 });
      const high = await memory.saveMemory({ content: 'beta high', initialScore: 3 });

      const results = await memory.searchMemory({ query: 'beta' });

      expect(results[0].id).toBe(high.id);
    });

    it('refreshes last_accessed_at of the returned rows only', async () => {
      withAxes({ hit: 1, miss: 2, probe: 1 });
      const hit = await memory.saveMemory({ content: 'hit' });
      const miss = await memory.saveMemory({ content: 'miss' });
      const stale = new Date('2020-01-01T00:00:00Z');
      await setTimes(hit.id, stale, stale);
      await setTimes(miss.id, stale, stale);

      await memory.searchMemory({ query: 'probe' });

      expect((await row(hit.id)).lastAccessedAt.getTime()).toBeGreaterThan(stale.getTime() + DAY);
      expect((await row(miss.id)).lastAccessedAt.getTime()).toBe(stale.getTime());
    });

    it('propagates an embedding failure', async () => {
      ctx.genAi.embedContent.mockRejectedValueOnce(new Error('embedding down'));

      await expect(memory.searchMemory({ query: 'x' })).rejects.toThrow('embedding down');
    });

    describe('DTO limits (enforced by the ValidationPipe, checked with class-validator)', () => {
      const errorsFor = (plain: object) => validate(plainToInstance(SearchMemoryDto, { query: 'q', ...plain }));

      it.each([1, 20])('accepts limit %i', async (limit) => {
        expect(await errorsFor({ limit })).toHaveLength(0);
      });

      it.each([0, 21, -1, 1.5])('rejects limit %s', async (limit) => {
        expect(await errorsFor({ limit })).not.toHaveLength(0);
      });

      it.each([-0.1, 1.1])('rejects minScore %s', async (minScore) => {
        expect(await errorsFor({ minScore })).not.toHaveLength(0);
      });

      it('rejects an empty query', async () => {
        expect(await errorsFor({ query: '' })).not.toHaveLength(0);
      });
    });
  });

  // ---------------------------------------------------------------- listMemories

  describe('listMemories', () => {
    const make = (content: string, createdAt: Date, data: Record<string, unknown> = {}) =>
      ctx.prisma.aiMemory.create({ data: { content, createdAt, ...data } });

    it('lists newest first with total, page and pageSize', async () => {
      await make('oldest', new Date('2024-01-01T00:00:00Z'));
      await make('newest', new Date('2024-03-01T00:00:00Z'));
      await make('middle', new Date('2024-02-01T00:00:00Z'));

      const result = await memory.listMemories({});

      expect(result.items.map((m) => m.content)).toEqual(['newest', 'middle', 'oldest']);
      expect(result).toMatchObject({ total: 3, page: 1, pageSize: 20 });
    });

    it('filters by category and by source', async () => {
      await make('a', new Date('2024-01-01T00:00:00Z'), { category: 'FACT', source: 'CHAT' });
      await make('b', new Date('2024-01-02T00:00:00Z'), { category: 'FACT', source: 'EMAIL' });
      await make('c', new Date('2024-01-03T00:00:00Z'), { category: 'EVENT', source: 'CHAT' });

      expect((await memory.listMemories({ category: 'FACT' })).items.map((m) => m.content)).toEqual(['b', 'a']);
      expect((await memory.listMemories({ source: 'CHAT' })).items.map((m) => m.content)).toEqual(['c', 'a']);
      const both = await memory.listMemories({ category: 'FACT', source: 'CHAT' });
      expect(both.items.map((m) => m.content)).toEqual(['a']);
      expect(both.total).toBe(1);
    });

    it('pages through the list', async () => {
      for (let i = 1; i <= 5; i++) await make(`m${i}`, new Date(`2024-01-0${i}T00:00:00Z`));

      const second = await memory.listMemories({ page: 2, pageSize: 2 });

      expect(second.items.map((m) => m.content)).toEqual(['m3', 'm2']);
      expect(second).toMatchObject({ total: 5, page: 2, pageSize: 2 });
      expect((await memory.listMemories({ page: 3, pageSize: 2 })).items.map((m) => m.content)).toEqual(['m1']);
      expect((await memory.listMemories({ page: 4, pageSize: 2 })).items).toEqual([]);
    });

    it('returns an empty page when nothing is stored', async () => {
      expect(await memory.listMemories({})).toMatchObject({ items: [], total: 0 });
    });

    describe('DTO limits', () => {
      const errorsFor = (plain: object) => validate(plainToInstance(ListMemoryDto, plain));

      it('accepts pageSize 50', async () => {
        expect(await errorsFor({ pageSize: '50' })).toHaveLength(0);
      });

      it.each(['51', '0', '-1'])('rejects pageSize %s', async (pageSize) => {
        expect(await errorsFor({ pageSize })).not.toHaveLength(0);
      });

      it('rejects page 0', async () => {
        expect(await errorsFor({ page: '0' })).not.toHaveLength(0);
      });
    });
  });

  // ---------------------------------------------------------------- updateMemory

  describe('updateMemory', () => {
    it('re-embeds and rebuilds the tsvector when the content changes', async () => {
      withAxes({ 'old words': 1, 'new words': 2 });
      const saved = await memory.saveMemory({ content: 'old words', category: 'FACT' });
      ctx.genAi.embedContent.mockClear();

      const updated = await memory.updateMemory(saved.id, { content: 'new words' });

      expect(updated.content).toBe('new words');
      expect(ctx.genAi.embedContent).toHaveBeenCalledTimes(1);
      expect(ctx.genAi.embedContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: 'new words',
          config: expect.objectContaining({ taskType: 'RETRIEVAL_DOCUMENT' }),
        }),
      );
      expect((await sqlInfo(saved.id, 'new')).hit).toBe(true);
      expect((await sqlInfo(saved.id, 'old')).hit).toBe(false);
      // the vector moved from axis 1 to axis 2
      withAxes({ 'probe old': 1, 'probe new': 2 });
      expect(await memory.searchMemory({ query: 'probe old' })).toEqual([]);
      expect((await memory.searchMemory({ query: 'probe new' })).map((r) => r.id)).toEqual([saved.id]);
      expect((await row(saved.id)).category).toBe('FACT');
    });

    it('changes only the category without calling the embedding API and keeps the vector', async () => {
      withAxes({ keep: 1, probe: 1 });
      const saved = await memory.saveMemory({ content: 'keep', category: 'FACT' });
      ctx.genAi.embedContent.mockClear();

      const updated = await memory.updateMemory(saved.id, { category: 'EVENT' });

      expect(updated.category).toBe('EVENT');
      expect(ctx.genAi.embedContent).not.toHaveBeenCalled();
      expect((await row(saved.id)).content).toBe('keep');
      expect((await sqlInfo(saved.id, 'keep')).dims).toBe(EMBEDDING_DIMENSIONS);
      expect((await memory.searchMemory({ query: 'probe' })).map((r) => r.id)).toEqual([saved.id]);
    });

    it('treats content null as "not provided"', async () => {
      const saved = await memory.saveMemory({ content: 'stay', category: 'FACT' });
      ctx.genAi.embedContent.mockClear();

      const updated = await memory.updateMemory(saved.id, { content: null as any, category: 'EVENT' });

      expect(updated).toMatchObject({ content: 'stay', category: 'EVENT' });
      expect(ctx.genAi.embedContent).not.toHaveBeenCalled();
    });

    it('clears the category when it is null', async () => {
      const saved = await memory.saveMemory({ content: 'x', category: 'FACT' });

      await memory.updateMemory(saved.id, { category: null as any });

      expect((await row(saved.id)).category).toBeNull();
    });

    it('keeps the category when it is not provided', async () => {
      withAxes({ before: 1, after: 2 });
      const saved = await memory.saveMemory({ content: 'before', category: 'FACT' });

      await memory.updateMemory(saved.id, { content: 'after' });

      expect((await row(saved.id)).category).toBe('FACT');
    });

    it('changes nothing when the embedding call fails', async () => {
      const saved = await memory.saveMemory({ content: 'original' });
      ctx.genAi.embedContent.mockRejectedValueOnce(new Error('embedding down'));

      await expect(memory.updateMemory(saved.id, { content: 'changed' })).rejects.toThrow('embedding down');

      expect((await row(saved.id)).content).toBe('original');
      expect((await sqlInfo(saved.id, 'original')).hit).toBe(true);
    });

    it('returns 404 for an unknown id and does not call the embedding API', async () => {
      await expect(memory.updateMemory(MISSING, { content: 'x' })).rejects.toBeInstanceOf(NotFoundException);

      expect(ctx.genAi.embedContent).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------- deleteMemory

  describe('deleteMemory', () => {
    it('deletes the row', async () => {
      const saved = await memory.saveMemory({ content: 'bye' });

      expect(await memory.deleteMemory(saved.id)).toEqual({ success: true });

      expect(await ctx.prisma.aiMemory.count()).toBe(0);
    });

    it('returns 404 for an unknown id and keeps the other rows', async () => {
      await memory.saveMemory({ content: 'stay' });

      await expect(memory.deleteMemory(MISSING)).rejects.toBeInstanceOf(NotFoundException);

      expect(await ctx.prisma.aiMemory.count()).toBe(1);
    });

    it('returns 404 on the second delete', async () => {
      const saved = await memory.saveMemory({ content: 'once' });
      await memory.deleteMemory(saved.id);

      await expect(memory.deleteMemory(saved.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ---------------------------------------------------------------- MemoryTools

  describe('MemoryTools', () => {
    it('searchSemanticMemory returns the hybrid search result', async () => {
      withAxes({ 'likes tea': 1, 'what drink': 1 });
      const saved = await memory.saveMemory({ content: 'likes tea' });

      const results = await tools.searchSemanticMemory({ query: 'what drink' });

      expect(results.map((r) => r.id)).toEqual([saved.id]);
    });

    it('saveUserMemory stores source CHAT, category GENERAL, score 1, decay 0.01 by default', async () => {
      const saved = await tools.saveUserMemory({ content: 'prefers tea' });

      expect(await row(saved.id)).toMatchObject({
        content: 'prefers tea',
        source: 'CHAT',
        category: 'GENERAL',
        initialScore: 1,
        decayFactor: 0.01,
      });
      expect((await sqlInfo(saved.id, 'tea')).hit).toBe(true);
    });

    it('saveUserMemory ignores source and decay chosen by the model but keeps category and score', async () => {
      const saved = await tools.saveUserMemory({
        content: 'sneaky',
        category: 'PREFERENCE',
        source: 'EMAIL',
        initialScore: 2,
        decayFactor: 5,
      });

      expect(await row(saved.id)).toMatchObject({
        source: 'CHAT',
        category: 'PREFERENCE',
        initialScore: 2,
        decayFactor: 0.01,
      });
    });

    it('saveUserMemory writes nothing when embedding fails', async () => {
      ctx.genAi.embedContent.mockRejectedValueOnce(new Error('embedding down'));

      await expect(tools.saveUserMemory({ content: 'x' })).rejects.toThrow('embedding down');

      expect(await ctx.prisma.aiMemory.count()).toBe(0);
    });
  });

  // ---------------------------------------------------------------- RagChunkService (smoke)

  describe('RagChunkService', () => {
    it('splitAndSaveDocument writes one rag_chunks row per chunk with sourceId and metadata', async () => {
      const content = Array.from({ length: 80 }, (_, i) => `sentence number ${i}.`).join(' ');

      const created = await rag.splitAndSaveDocument('doc-1', content, { type: 'TEST' });

      const stored = await ctx.prisma.ragChunk.findMany({ where: { sourceId: 'doc-1' } });
      expect(created.length).toBeGreaterThan(1);
      expect(stored).toHaveLength(created.length);
      expect(stored.every((c) => c.chunkText.length <= 500)).toBe(true);
      expect(stored.every((c) => (c.metadata as any).type === 'TEST')).toBe(true);
    });

    it('splitAndSaveDocument defaults metadata to an empty object', async () => {
      await rag.splitAndSaveDocument('doc-2', 'short text');

      const [stored] = await ctx.prisma.ragChunk.findMany({ where: { sourceId: 'doc-2' } });
      expect(stored).toMatchObject({ chunkText: 'short text', metadata: {} });
    });

    it('syncEmailToMemory stores a memory (source EMAIL) and, for a long body, chunks', async () => {
      const email = await ctx.prisma.emailLog.create({
        data: {
          messageId: '<rag@mail>',
          sender: 'boss@example.com',
          subject: 'Plan',
          rawBody: 'word '.repeat(200),
        },
      });

      const saved = await rag.syncEmailToMemory(email.id);

      expect(await row(saved!.id)).toMatchObject({ category: 'EMAIL', source: 'EMAIL', decayFactor: 0.005 });
      expect((await row(saved!.id)).content).toContain('boss@example.com');
      expect(await ctx.prisma.ragChunk.count({ where: { sourceId: email.id } })).toBeGreaterThan(0);
    });

    it('syncEmailToMemory returns null for an unknown email', async () => {
      expect(await rag.syncEmailToMemory(MISSING)).toBeNull();
      expect(await ctx.prisma.aiMemory.count()).toBe(0);
    });

    it('syncTransactionToMemory stores a FINANCE memory and returns null for an unknown transaction', async () => {
      const account = await seedAccount(ctx.prisma);
      const tx = await ctx.prisma.transaction.create({
        data: {
          accountId: account.id,
          amount: 50000,
          type: 'EXPENSE',
          counterparty: 'Cafe',
          transactionTime: new Date('2030-01-01T00:00:00Z'),
        },
      });

      const saved = await rag.syncTransactionToMemory(tx.id);

      expect(await row(saved!.id)).toMatchObject({
        category: 'FINANCE',
        source: 'TRANSACTION',
        initialScore: 1.2,
        decayFactor: 0.002,
      });
      expect((await row(saved!.id)).content).toContain('Cafe');
      expect(await rag.syncTransactionToMemory(MISSING)).toBeNull();
    });
  });
});
