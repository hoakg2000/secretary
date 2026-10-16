import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { lastValueFrom, toArray } from 'rxjs';
import {
  AgentService,
  DEFAULT_MEMORY_RULE,
  MAX_TOOL_ROUNDS,
} from '../../src/ai-agent/services/agent/agent.service';
import { ChatSessionService } from '../../src/ai-agent/services/chat/chat-session.service';
import { MemoryService } from '../../src/ai-agent/services/memory/memory.service';
import { calls, createTestModule, resetDb, seedAccount, seedUser, TestContext, text } from './harness';

let ctx: TestContext;
let sessions: ChatSessionService;
let userId: string;

beforeAll(async () => {
  ctx = await createTestModule();
  sessions = ctx.moduleRef.get(ChatSessionService);
});
beforeEach(async () => {
  await resetDb(ctx.prisma);
  ctx.genAi.script.length = 0;
  ctx.genAi.create.mockClear();
  ctx.genAi.sendMessageStream.mockClear();
  userId = (await seedUser(ctx.prisma)).id;
});
afterAll(() => ctx.moduleRef.close());

// role breaks a same-millisecond tie: USER sorts before MODEL
const messagesOf = (sessionId?: string) =>
  ctx.prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: [{ createdAt: 'asc' }, { role: 'asc' }],
  });

describe('ChatSessionService (integration)', () => {
  /** Messages one second apart so the order never depends on the random ID */
  const seedMessages = async (sessionId: string, rows: [role: 'USER' | 'MODEL', content: string][]) => {
    const created = [];
    for (const [index, [role, content]] of rows.entries()) {
      created.push(
        await ctx.prisma.chatMessage.create({
          data: { sessionId, role, content, createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, index)) },
        }),
      );
    }
    return created;
  };

  it('resolve creates a session with a title of at most 80 characters and hides foreign sessions', async () => {
    const other = await seedUser(ctx.prisma);
    const created = await sessions.resolve(userId, undefined, null, 'x'.repeat(200));

    expect(await ctx.prisma.chatSession.findUnique({ where: { id: created.id } })).toMatchObject({
      userId,
      title: 'x'.repeat(80),
    });
    await expect(sessions.resolve(userId, created.id)).resolves.toMatchObject({ id: created.id });
    await expect(sessions.resolve(other.id, created.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(sessions.resolve(userId, randomUUID())).rejects.toBeInstanceOf(NotFoundException);
    expect(await ctx.prisma.chatSession.count()).toBe(1);
  });

  it('appendMessage stores the row and advances lastMessageAt', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const session = await ctx.prisma.chatSession.create({ data: { userId, lastMessageAt: past } });

    const message = await sessions.appendMessage(session.id, 'MODEL', 'hello', [{ tool: 't' }]);

    expect(await ctx.prisma.chatMessage.findUnique({ where: { id: message.id } })).toMatchObject({
      sessionId: session.id,
      role: 'MODEL',
      content: 'hello',
      toolCalls: [{ tool: 't' }],
    });
    const stored = await ctx.prisma.chatSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(stored.lastMessageAt.getTime()).toBeGreaterThan(past.getTime());
  });

  it('recentHistory is oldest first, before the cursor, without empty rows, starting at a user turn', async () => {
    const session = await sessions.resolve(userId);
    const rows = await seedMessages(session.id, [
      ['MODEL', 'orphan answer'],
      ['USER', 'first question'],
      ['MODEL', ''],
      ['MODEL', 'first answer'],
      ['USER', 'second question'],
      ['USER', 'current'],
      ['MODEL', 'later'],
    ]);
    const cursor = rows[5].id;
    const user = (value: string) => ({ role: 'user', parts: [{ text: value }] });
    const model = (value: string) => ({ role: 'model', parts: [{ text: value }] });

    expect(await sessions.recentHistory(session.id, cursor)).toEqual([
      user('first question'),
      model('first answer'),
      user('second question'),
    ]);
    // limit 2 = the two rows before the cursor; the leading model turn is dropped
    expect(await sessions.recentHistory(session.id, cursor, 2)).toEqual([user('second question')]);
  });

  it('listSessions is scoped to the user and ordered by lastMessageAt; listMessages pages and checks ownership', async () => {
    const other = await seedUser(ctx.prisma);
    const day = (d: number) => new Date(Date.UTC(2026, 9, d));
    const older = await ctx.prisma.chatSession.create({ data: { userId, lastMessageAt: day(1) } });
    const newer = await ctx.prisma.chatSession.create({ data: { userId, lastMessageAt: day(2) } });
    await ctx.prisma.chatSession.create({ data: { userId: other.id, lastMessageAt: day(3) } });
    const rows = await seedMessages(older.id, [
      ['USER', 'a'],
      ['MODEL', 'b'],
      ['USER', 'c'],
    ]);

    const list = await sessions.listSessions(userId);
    expect(list.total).toBe(2);
    expect(list.items.map((s) => s.id)).toEqual([newer.id, older.id]);
    expect((await sessions.listSessions(userId, 2, 1)).items.map((s) => s.id)).toEqual([older.id]);

    const page = await sessions.listMessages(userId, older.id, 2, 2);
    expect(page).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(page.items.map((m) => m.id)).toEqual([rows[2].id]);
    await expect(sessions.listMessages(other.id, older.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deleteSession cascades messages, keeps the linked memory and ignores foreign sessions', async () => {
    const other = await seedUser(ctx.prisma);
    const session = await sessions.resolve(userId);
    const saved = await ctx.moduleRef.get(MemoryService).saveMemory({ content: 'likes tea' });
    const message = await sessions.appendMessage(session.id, 'USER', 'I like tea');
    await sessions.linkMemory(message.id, saved.id);

    await expect(sessions.deleteSession(other.id, session.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(await ctx.prisma.chatMessage.count()).toBe(1);

    await sessions.deleteSession(userId, session.id);

    expect(await ctx.prisma.chatSession.count()).toBe(0);
    expect(await ctx.prisma.chatMessage.count()).toBe(0);
    expect(await ctx.prisma.aiMemory.count()).toBe(1);
  });
});

describe('AgentService (integration)', () => {
  let agent: AgentService;

  beforeAll(() => {
    agent = ctx.moduleRef.get(AgentService);
  });

  const run = async (dto: { message: string; sessionId?: string; characterId?: string }) => {
    const stream = await agent.chatStream(userId, dto);
    const frames = await lastValueFrom(stream.pipe(toArray()));
    return frames.map((frame) => JSON.parse(frame.data));
  };
  const types = (frames: any[]) => frames.map((frame) => frame.type);
  /** functionResponse parts sent back to the model on the n-th send (0 = the user message) */
  const sent = (n: number) =>
    ctx.genAi.sendMessageStream.mock.calls[n][0].message.map((part: any) => part.functionResponse);
  const systemInstruction = (n: number) => ctx.genAi.create.mock.calls[n][0].config.systemInstruction;
  const balanceOf = async (id: string) =>
    (await ctx.prisma.bankAccount.findUniqueOrThrow({ where: { id } })).cachedBalance.toFixed(2);

  it('a plain text turn stores the USER and MODEL rows; the next turn sends them as history', async () => {
    ctx.genAi.script.push([text('Xin '), text('chào!')], [text('Lại chào')]);

    const frames = await run({ message: 'hello' });
    const { sessionId } = frames[0];

    expect(frames).toEqual([
      { type: 'session', sessionId },
      { type: 'text', content: 'Xin ' },
      { type: 'text', content: 'chào!' },
      { type: 'done' },
    ]);
    expect(await messagesOf(sessionId)).toMatchObject([
      { role: 'USER', content: 'hello' },
      { role: 'MODEL', content: 'Xin chào!', toolCalls: null },
    ]);
    expect(ctx.genAi.create.mock.calls[0][0].history).toEqual([]);

    await run({ message: 'again', sessionId });

    expect(ctx.genAi.create.mock.calls[1][0].history).toEqual([
      { role: 'user', parts: [{ text: 'hello' }] },
      { role: 'model', parts: [{ text: 'Xin chào!' }] },
    ]);
    expect(await ctx.prisma.chatSession.count()).toBe(1);
    expect(await ctx.prisma.chatMessage.count()).toBe(4);
  });

  it('an unknown or foreign session is rejected before any model call', async () => {
    const other = await seedUser(ctx.prisma);
    const foreign = await sessions.resolve(other.id);

    for (const sessionId of [randomUUID(), foreign.id]) {
      await expect(agent.chatStream(userId, { message: 'hello', sessionId })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    }

    expect(ctx.genAi.create).not.toHaveBeenCalled();
    expect(await ctx.prisma.chatMessage.count()).toBe(0);
    expect(await ctx.prisma.chatSession.count()).toBe(1);
  });

  it('a read tool runs against the database and its result is stored as plain JSON', async () => {
    const account = await seedAccount(ctx.prisma, { cachedBalance: 1234.5 });
    ctx.genAi.script.push(
      [calls({ id: 'c1', name: 'get_financial_summary', args: {} })],
      [text('You have 1234.5')],
    );

    const frames = await run({ message: 'how much do I have?' });

    expect(types(frames)).toEqual(['session', 'tool_call', 'tool_result', 'text', 'done']);
    const result = {
      summary: { totals: [{ currency: 'VND', totalBalance: '1234.5', totalAccounts: 1 }] },
      accounts: [{ id: account.id, cachedBalance: '1234.5', currency: 'VND' }],
    };
    expect(sent(1)[0]).toMatchObject({ id: 'c1', name: 'get_financial_summary', response: { result } });
    const [, model] = await messagesOf(frames[0].sessionId);
    expect(model).toMatchObject({
      role: 'MODEL',
      content: 'You have 1234.5',
      toolCalls: [{ tool: 'get_financial_summary', args: {}, result }],
    });
  });

  it('a write tool waits for confirmation: nothing is written until confirmAction, and only once', async () => {
    const account = await seedAccount(ctx.prisma);
    const propose = async () => {
      ctx.genAi.script.push(
        [
          calls({
            name: 'create_financial_transaction',
            args: { accountId: account.id, amount: 5000, type: 'EXPENSE', note: 'coffee' },
          }),
        ],
        [text('Please confirm')],
      );
      const frames = await run({ message: 'I spent 5000 on coffee' });
      return frames.find((frame) => frame.type === 'confirmation_required');
    };

    const confirmed = await propose();
    expect(confirmed).toMatchObject({ tool: 'create_financial_transaction' });
    expect(sent(1)[0].response).toEqual({ status: 'awaiting_user_confirmation' });
    expect(await ctx.prisma.transaction.count()).toBe(0);
    expect(await balanceOf(account.id)).toBe('1000000.00');

    await agent.confirmAction(confirmed.actionId);
    expect(await ctx.prisma.transaction.findMany()).toMatchObject([
      { accountId: account.id, type: 'EXPENSE', note: 'coffee' },
    ]);
    expect(await balanceOf(account.id)).toBe('995000.00');
    await expect(agent.confirmAction(confirmed.actionId)).rejects.toBeInstanceOf(NotFoundException);

    const discarded = await propose();
    agent.discardAction(discarded.actionId);
    await expect(agent.confirmAction(discarded.actionId)).rejects.toBeInstanceOf(NotFoundException);

    expect(await ctx.prisma.transaction.count()).toBe(1);
    expect(await balanceOf(account.id)).toBe('995000.00');
  });

  it('invalid tool arguments are reported to the model and nothing is written', async () => {
    const account = await seedAccount(ctx.prisma);
    ctx.genAi.script.push(
      [
        calls({
          name: 'create_financial_transaction',
          args: { accountId: account.id, amount: -5, type: 'EXPENSE', emailLogId: randomUUID() },
        }),
      ],
      [text('Sorry')],
    );

    const frames = await run({ message: 'spend -5' });

    expect(types(frames)).toEqual(['session', 'text', 'done']);
    expect(sent(1)[0].response).toMatchObject({ error: 'invalid arguments' });
    expect(await ctx.prisma.transaction.count()).toBe(0);
    expect(await balanceOf(account.id)).toBe('1000000.00');
    const [, model] = await messagesOf(frames[0].sessionId);
    expect(model.toolCalls).toMatchObject([{ error: 'invalid arguments' }]);
  });

  it('save_user_memory stores CHAT memories and links only the first one to the user message', async () => {
    ctx.genAi.script.push(
      [
        calls(
          { name: 'save_user_memory', args: { content: 'likes tea', source: 'MANUAL' } },
          { name: 'save_user_memory', args: { content: 'has a cat', category: 'FACT' } },
        ),
      ],
      [text('Noted')],
    );

    const frames = await run({ message: 'I like tea and I have a cat' });

    const memories = await ctx.prisma.aiMemory.findMany({ orderBy: { content: 'desc' } });
    expect(memories).toMatchObject([
      { content: 'likes tea', source: 'CHAT', category: 'GENERAL' },
      { content: 'has a cat', source: 'CHAT', category: 'FACT' },
    ]);
    const [user, model] = await messagesOf(frames[0].sessionId);
    expect(user.memoryId).toBe(memories[0].id);
    expect(model.memoryId).toBeNull();
  });

  it('uses the explicit character, then the session character, then the active one; memories reach the prompt', async () => {
    const active = await ctx.prisma.character.create({
      data: {
        name: 'Active',
        isActive: true,
        memoryRule: 'RULE-ACTIVE',
        personas: { create: { type: 'TONE', value: 'PERSONA-ACTIVE' } },
      },
    });
    const other = await ctx.prisma.character.create({
      data: { name: 'Other', personas: { create: { type: 'TONE', value: 'PERSONA-OTHER' } } },
    });
    await ctx.moduleRef.get(MemoryService).saveMemory({ content: 'user likes green tea' });
    const characterOf = async (id: string) =>
      (await ctx.prisma.chatSession.findUniqueOrThrow({ where: { id } })).characterId;

    const [fallback] = await run({ message: 'hello' });
    expect(systemInstruction(0)).toContain('PERSONA-ACTIVE');
    expect(systemInstruction(0)).toContain('RULE-ACTIVE');
    expect(systemInstruction(0)).toContain('- user likes green tea');
    expect(await characterOf(fallback.sessionId)).toBe(active.id);

    const [explicit] = await run({ message: 'hello', characterId: other.id });
    expect(systemInstruction(1)).toContain('PERSONA-OTHER');
    expect(systemInstruction(1)).toContain(DEFAULT_MEMORY_RULE);
    expect(systemInstruction(1)).not.toContain('PERSONA-ACTIVE');
    expect(await characterOf(explicit.sessionId)).toBe(other.id);

    await run({ message: 'again', sessionId: explicit.sessionId });
    expect(systemInstruction(2)).toContain('PERSONA-OTHER');
  });

  it('a failing model stream ends with an error frame and keeps only the USER row', async () => {
    ctx.genAi.sendMessageStream.mockRejectedValueOnce(new Error('model down'));

    const frames = await run({ message: 'hello' });

    expect(frames.at(-1)).toEqual({ type: 'error', message: 'model down' });
    expect(await messagesOf(frames[0].sessionId)).toMatchObject([{ role: 'USER', content: 'hello' }]);
  });

  it('unsubscribing mid-stream stores no MODEL row', async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    let finished = () => {};
    const streamEnded = new Promise<void>((resolve) => (finished = resolve));
    ctx.genAi.sendMessageStream.mockImplementationOnce(async () =>
      (async function* () {
        try {
          yield text('partial');
          await gate;
          yield text(' answer');
        } finally {
          finished();
        }
      })(),
    );

    const stream = await agent.chatStream(userId, { message: 'hello' });
    await new Promise<void>((resolve) => {
      const subscription = stream.subscribe((frame) => {
        if (JSON.parse(frame.data).type === 'text') {
          subscription.unsubscribe();
          resolve();
        }
      });
    });
    release();
    await streamEnded;
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(await messagesOf()).toMatchObject([{ role: 'USER', content: 'hello' }]);
  });

  it(`more than ${MAX_TOOL_ROUNDS} tool rounds end with an error frame`, async () => {
    await seedAccount(ctx.prisma);
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      ctx.genAi.script.push([calls({ name: 'get_financial_summary', args: {} })]);
    }

    const frames = await run({ message: 'loop' });

    expect(frames.at(-1).type).toBe('error');
    expect(ctx.genAi.sendMessageStream).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS + 1);
    expect(await messagesOf(frames[0].sessionId)).toMatchObject([{ role: 'USER', content: 'loop' }]);
  });
});
