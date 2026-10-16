import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MemoryService } from '../../src/ai-agent/services/memory/memory.service';
import { RagChunkService } from '../../src/ai-agent/services/rag-chunk/rag-chunk.service';
import { createTestModule, resetDb, seedUser, TestContext } from './harness';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('MemoryService (integration)', () => {
  let ctx: TestContext;
  let memory: MemoryService;

  beforeAll(async () => {
    ctx = await createTestModule();
    memory = ctx.moduleRef.get(MemoryService);
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    ctx.genAi.axes.clear();
  });
  afterAll(() => ctx.moduleRef.close());

  /** Saves a memory whose embedding is the one-hot vector of `axis` */
  const save = (content: string, axis: number, overrides: object = {}) => {
    ctx.genAi.axes.set(content, axis);
    return memory.saveMemory({ content, ...overrides });
  };
  const search = (query: string, axis: number, overrides: object = {}) => {
    ctx.genAi.axes.set(query, axis);
    return memory.searchMemory({ query, ...overrides });
  };
  const setLastAccessed = (id: string, at: Date) =>
    ctx.prisma.$executeRaw`UPDATE ai_memories SET last_accessed_at = ${at} WHERE id = ${id}`;

  it('saveMemory writes the embedding and the tsvector, with default category and source', async () => {
    const saved = await save('likes green tea', 1);

    const [row] = await ctx.prisma.$queryRaw<any[]>`
      SELECT embedding IS NOT NULL AS embedded, content_tsv IS NOT NULL AS indexed,
             vector_dims(embedding) AS dims, category, source
      FROM ai_memories WHERE id = ${saved.id}`;
    expect(row).toEqual({
      embedded: true,
      indexed: true,
      dims: 1536,
      category: 'GENERAL',
      source: 'MANUAL',
    });
  });

  it('an embedding of the wrong length is rejected and leaves no row', async () => {
    ctx.genAi.embedContent.mockResolvedValueOnce({ embeddings: [{ values: [1, 0, 0] }] });
    await expect(memory.saveMemory({ content: 'short from the model' })).rejects.toThrow('1536');

    // Past the service check: the database refuses the vector and the insert is rolled back
    vi.spyOn(memory, 'generateEmbedding').mockResolvedValueOnce([1, 0, 0]);
    await expect(memory.saveMemory({ content: 'short at the database' })).rejects.toThrow();

    expect(await ctx.prisma.aiMemory.count()).toBe(0);
  });

  it('searchMemory returns the same-axis memory with typed fields and drops the other axis', async () => {
    const tea = await save('likes green tea', 1);
    const coffee = await save('never drinks coffee', 2);

    const results = await search('what to drink', 1);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: tea.id,
      content: 'likes green tea',
      category: 'GENERAL',
      source: 'MANUAL',
    });
    expect(results[0].similarity).toBeCloseTo(1, 5);
    expect(results[0].decayedScore).toBeCloseTo(1, 2);
    expect(results[0].finalScore).toBeCloseTo(0.7, 2);
    expect(results[0].createdAt).toBeInstanceOf(Date);
    expect(results[0].lastAccessedAt).toBeInstanceOf(Date);

    const all = await search('what to drink', 1, { minScore: 0 });
    expect(all.map((r) => r.id)).toEqual([tea.id, coffee.id]);
    expect(all[1].similarity).toBeCloseTo(0, 5);
  });

  it('ranks by decay and initial score, and a keyword match raises the final score', async () => {
    const fresh = await save('fresh', 1);
    const weak = await save('weak', 1, { initialScore: 0.5 });
    const old = await save('old', 1);
    await setLastAccessed(old.id, new Date(Date.now() - 100 * DAY_MS));

    const ranked = await search('ranking', 1);

    // 0.7 > 0.7 * 0.5 > 0.7 * e^(-0.01 * 100)
    expect(ranked.map((r) => r.id)).toEqual([fresh.id, weak.id, old.id]);
    expect(ranked[2].decayedScore).toBeCloseTo(Math.exp(-1), 2);

    const keyword = await save('green tea every morning', 2);
    const plain = await save('likes warm drinks', 2);

    const byKeyword = await search('tea', 2);

    expect(byKeyword.map((r) => r.id)).toEqual([keyword.id, plain.id]);
    expect(byKeyword[0].similarity).toBeCloseTo(byKeyword[1].similarity, 5);
    expect(byKeyword[0].finalScore).toBeGreaterThan(byKeyword[1].finalScore);
  });

  it('searchMemory filters by category and source and respects the limit', async () => {
    const fact = await save('a fact', 1, { category: 'FACT' });
    const chat = await save('from chat', 1, { source: 'CHAT' });
    await save('another', 1);

    expect((await search('q', 1, { category: 'FACT' })).map((r) => r.id)).toEqual([fact.id]);
    expect((await search('q', 1, { source: 'CHAT' })).map((r) => r.id)).toEqual([chat.id]);
    expect(await search('q', 1, { category: 'FACT', source: 'CHAT' })).toEqual([]);
    expect(await search('q', 1, { limit: 2 })).toHaveLength(2);
  });

  it('only returned rows get lastAccessedAt refreshed', async () => {
    const past = new Date(Date.now() - 10 * DAY_MS);
    const hit = await save('hit', 1);
    const miss = await save('miss', 2);
    await setLastAccessed(hit.id, past);
    await setLastAccessed(miss.id, past);

    await search('q', 1);

    const accessed = async (id: string) =>
      (await ctx.prisma.aiMemory.findUniqueOrThrow({ where: { id } })).lastAccessedAt.getTime();
    expect(await accessed(hit.id)).toBeGreaterThan(past.getTime());
    expect(await accessed(miss.id)).toBe(past.getTime());
  });

  it('a row without embedding is never returned', async () => {
    await ctx.prisma.aiMemory.create({ data: { content: 'no vector' } });

    expect(await search('no vector', 0, { minScore: 0 })).toEqual([]);
  });

  it('listMemories filters and pages, newest first', async () => {
    const ids: string[] = [];
    for (const [content, overrides] of [
      ['one', { category: 'FACT' }],
      ['two', { source: 'CHAT' }],
      ['three', {}],
    ] as const) {
      const saved = await save(content, 1, overrides);
      await ctx.prisma.aiMemory.update({
        where: { id: saved.id },
        data: { createdAt: new Date(Date.now() + ids.length * 1000) },
      });
      ids.push(saved.id);
    }

    expect((await memory.listMemories({ category: 'FACT' })).items.map((m) => m.id)).toEqual([ids[0]]);
    expect((await memory.listMemories({ source: 'CHAT' })).items.map((m) => m.id)).toEqual([ids[1]]);

    const page = await memory.listMemories({ page: 2, pageSize: 2 });
    expect(page).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(page.items.map((m) => m.id)).toEqual([ids[0]]);
  });

  it('deleteMemory detaches the linked chat message', async () => {
    const user = await seedUser(ctx.prisma);
    const saved = await save('linked', 1);
    const message = await ctx.prisma.chatMessage.create({
      data: {
        role: 'USER',
        content: 'remember this',
        memory: { connect: { id: saved.id } },
        session: { create: { userId: user.id } },
      },
    });

    await memory.deleteMemory(saved.id);

    expect(await ctx.prisma.aiMemory.count()).toBe(0);
    expect(await ctx.prisma.chatMessage.findUnique({ where: { id: message.id } })).toMatchObject({
      memoryId: null,
    });
    await expect(memory.deleteMemory(randomUUID())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('RagChunkService.syncEmailToMemory stores one memory and chunks a long body', async () => {
    const rag = ctx.moduleRef.get(RagChunkService);
    const email = await ctx.prisma.emailLog.create({
      data: {
        messageId: randomUUID(),
        sender: 'boss@work.com',
        subject: 'Plan',
        rawBody: 'A long sentence about the quarterly plan. '.repeat(40),
      },
    });

    await rag.syncEmailToMemory(email.id);

    expect(await ctx.prisma.aiMemory.findMany()).toMatchObject([{ category: 'EMAIL', source: 'EMAIL' }]);
    const chunks = await ctx.prisma.ragChunk.findMany();
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.sourceId === email.id)).toBe(true);

    await expect(rag.syncEmailToMemory(randomUUID())).resolves.toBeNull();
  });
});
