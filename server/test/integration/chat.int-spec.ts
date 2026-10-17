import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ChatRole } from '@prisma/client';
import { lastValueFrom, toArray } from 'rxjs';
import { ChatStreamDto } from '../../src/ai-agent/dto/chat-stream.dto';
import prompt from '../../src/ai-agent/prompts/data.json';
import { ReplyStreamParser } from '../../src/ai-agent/services/agent/reply-stream.parser';
import { AgentService, CHAT_MODEL, DEFAULT_MEMORY_RULE, REPLY_SCHEMA } from '../../src/ai-agent/services/agent/agent.service';
import { ChatSessionService } from '../../src/ai-agent/services/chat/chat-session.service';
import { MemoryService } from '../../src/ai-agent/services/memory/memory.service';
import {
  MISSING,
  calls,
  chunkAt,
  chunkBySize,
  createTestModule,
  rejection,
  reply,
  replyJson,
  httpError,
  resetState,
  seedAccount,
  seedCharacter,
  seedUser,
  text,
  type TestContext,
} from './harness';

const BASE = new Date('2024-01-01T00:00:00Z').getTime();

describe('chat integration', () => {
  let ctx: TestContext;
  let sessions: ChatSessionService;
  let agent: AgentService;
  let memory: MemoryService;

  beforeAll(async () => {
    ctx = await createTestModule();
    sessions = ctx.moduleRef.get(ChatSessionService);
    agent = ctx.moduleRef.get(AgentService);
    memory = ctx.moduleRef.get(MemoryService);
  });

  afterAll(() => ctx.close());

  beforeEach(async () => {
    await resetState(ctx);
    // nothing here enqueues, but keep the real worker away from the queue anyway
    await ctx.queue.pause();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const makeSession = async (userId: string, data: Record<string, unknown> = {}) =>
    ctx.prisma.chatSession.create({ data: { userId, ...data } as any });
  /** message created `index` seconds after BASE so the order is deterministic */
  const makeMessage = (sessionId: string, index: number, role: ChatRole, content: string) =>
    ctx.prisma.chatMessage.create({
      data: { sessionId, role, content, createdAt: new Date(BASE + index * 1000) },
    });
  const messagesOf = (sessionId: string) =>
    ctx.prisma.chatMessage.findMany({ where: { sessionId }, orderBy: { createdAt: 'asc' } });

  // ---------------------------------------------------------------- ChatSessionService

  describe('ChatSessionService', () => {
    describe('resolve', () => {
      it('creates a session for the user with the character and a title cut to 80 characters', async () => {
        const user = await seedUser(ctx.prisma);
        const character = await seedCharacter(ctx.prisma);

        const session = await sessions.resolve(user.id, undefined, character.id, 'x'.repeat(100));

        const saved = await ctx.prisma.chatSession.findUniqueOrThrow({ where: { id: session.id } });
        expect(saved).toMatchObject({ userId: user.id, characterId: character.id, title: 'x'.repeat(80) });
      });

      it('returns the user own session', async () => {
        const user = await seedUser(ctx.prisma);
        const own = await makeSession(user.id);

        const session = await sessions.resolve(user.id, own.id);

        expect(session.id).toBe(own.id);
        expect(await ctx.prisma.chatSession.count()).toBe(1);
      });

      it('returns 404 for another user session', async () => {
        const owner = await seedUser(ctx.prisma);
        const other = await seedUser(ctx.prisma);
        const foreign = await makeSession(owner.id);

        await expect(sessions.resolve(other.id, foreign.id)).rejects.toBeInstanceOf(NotFoundException);
      });

      it('returns 404 for an unknown session', async () => {
        const user = await seedUser(ctx.prisma);

        await expect(sessions.resolve(user.id, MISSING)).rejects.toBeInstanceOf(NotFoundException);
      });
    });

    describe('appendMessage', () => {
      it('stores the message verbatim with its tool calls and moves last_message_at forward', async () => {
        const user = await seedUser(ctx.prisma);
        const old = new Date('2020-01-01T00:00:00Z');
        const session = await makeSession(user.id, { lastMessageAt: old });

        const message = await sessions.appendMessage(session.id, ChatRole.MODEL, '  hi there  ', [{ tool: 't' }]);

        const saved = await ctx.prisma.chatMessage.findUniqueOrThrow({ where: { id: message.id } });
        expect(saved).toMatchObject({
          sessionId: session.id,
          role: 'MODEL',
          content: '  hi there  ',
          toolCalls: [{ tool: 't' }],
        });
        const after = await ctx.prisma.chatSession.findUniqueOrThrow({ where: { id: session.id } });
        expect(after.lastMessageAt.getTime()).toBeGreaterThan(old.getTime() + 86_400_000);
      });

      it('stores the Japanese text when given and null otherwise', async () => {
        const user = await seedUser(ctx.prisma);
        const session = await makeSession(user.id);

        const withJp = await sessions.appendMessage(session.id, ChatRole.MODEL, 'xin chao', undefined, 'konnichiwa');
        const without = await sessions.appendMessage(session.id, ChatRole.MODEL, 'xin chao');

        expect((await ctx.prisma.chatMessage.findUniqueOrThrow({ where: { id: withJp.id } })).contentJp).toBe('konnichiwa');
        expect((await ctx.prisma.chatMessage.findUniqueOrThrow({ where: { id: without.id } })).contentJp).toBeNull();
      });

      it('stores no tool calls when none are given', async () => {
        const user = await seedUser(ctx.prisma);
        const session = await makeSession(user.id);

        const message = await sessions.appendMessage(session.id, ChatRole.USER, 'hello');

        expect((await ctx.prisma.chatMessage.findUniqueOrThrow({ where: { id: message.id } })).toolCalls).toBeNull();
      });

      it('writes nothing for an unknown session', async () => {
        expect(await rejection(sessions.appendMessage(MISSING, ChatRole.USER, 'x'))).toMatchObject({ code: 'P2003' });

        expect(await ctx.prisma.chatMessage.count()).toBe(0);
      });
    });

    describe('recentHistory', () => {
      it('returns the 20 messages before the given one, oldest first, in Gemini format', async () => {
        const user = await seedUser(ctx.prisma);
        const session = await makeSession(user.id);
        const rows = [];
        for (let i = 0; i < 25; i++) {
          rows.push(await makeMessage(session.id, i, i % 2 === 0 ? ChatRole.USER : ChatRole.MODEL, `m${i}`));
        }

        const history = await sessions.recentHistory(session.id, rows[24].id);

        expect(history).toHaveLength(20);
        expect(history[0]).toEqual({ role: 'user', parts: [{ text: 'm4' }] });
        expect(history[1]).toEqual({ role: 'model', parts: [{ text: 'm5' }] });
        expect(history[19]).toEqual({ role: 'model', parts: [{ text: 'm23' }] });
      });

      it('honours a smaller limit and excludes the cursor and newer messages', async () => {
        const user = await seedUser(ctx.prisma);
        const session = await makeSession(user.id);
        const rows = [];
        for (let i = 0; i < 6; i++) {
          rows.push(await makeMessage(session.id, i, i % 2 === 0 ? ChatRole.USER : ChatRole.MODEL, `m${i}`));
        }

        const history = await sessions.recentHistory(session.id, rows[4].id, 2);

        expect(history.map((t) => t.parts[0].text)).toEqual(['m2', 'm3']);
      });

      it('drops rows with empty text', async () => {
        const user = await seedUser(ctx.prisma);
        const session = await makeSession(user.id);
        await makeMessage(session.id, 0, ChatRole.USER, 'q');
        await makeMessage(session.id, 1, ChatRole.MODEL, '');
        await makeMessage(session.id, 2, ChatRole.USER, 'q2');
        const current = await makeMessage(session.id, 3, ChatRole.USER, 'now');

        const history = await sessions.recentHistory(session.id, current.id);

        expect(history.map((t) => t.parts[0].text)).toEqual(['q', 'q2']);
      });

      it('drops leading model turns so the history starts with the user', async () => {
        const user = await seedUser(ctx.prisma);
        const session = await makeSession(user.id);
        await makeMessage(session.id, 0, ChatRole.MODEL, 'orphan');
        await makeMessage(session.id, 1, ChatRole.USER, 'q');
        await makeMessage(session.id, 2, ChatRole.MODEL, 'a');
        const current = await makeMessage(session.id, 3, ChatRole.USER, 'now');

        const history = await sessions.recentHistory(session.id, current.id);

        expect(history.map((t) => t.parts[0].text)).toEqual(['q', 'a']);
      });

      it('returns an empty history when there is no user turn', async () => {
        const user = await seedUser(ctx.prisma);
        const session = await makeSession(user.id);
        await makeMessage(session.id, 0, ChatRole.MODEL, 'only model');
        const current = await makeMessage(session.id, 1, ChatRole.USER, 'now');

        expect(await sessions.recentHistory(session.id, current.id)).toEqual([]);
      });

      it('ignores the messages of other sessions', async () => {
        const user = await seedUser(ctx.prisma);
        const a = await makeSession(user.id);
        const b = await makeSession(user.id);
        await makeMessage(b.id, 0, ChatRole.USER, 'other session');
        await makeMessage(a.id, 1, ChatRole.USER, 'mine');
        const current = await makeMessage(a.id, 2, ChatRole.USER, 'now');

        const history = await sessions.recentHistory(a.id, current.id);

        expect(history.map((t) => t.parts[0].text)).toEqual(['mine']);
      });
    });

    describe('linkMemory', () => {
      it('sets chat_messages.memory_id', async () => {
        const user = await seedUser(ctx.prisma);
        const session = await makeSession(user.id);
        const message = await makeMessage(session.id, 0, ChatRole.USER, 'remember this');
        const saved = await memory.saveMemory({ content: 'remember this' });

        await sessions.linkMemory(message.id, saved.id);

        expect((await ctx.prisma.chatMessage.findUniqueOrThrow({ where: { id: message.id } })).memoryId).toBe(saved.id);
      });

      it('fails for a memory already linked to another message (memory_id is unique)', async () => {
        const user = await seedUser(ctx.prisma);
        const session = await makeSession(user.id);
        const first = await makeMessage(session.id, 0, ChatRole.USER, 'a');
        const second = await makeMessage(session.id, 1, ChatRole.USER, 'b');
        const saved = await memory.saveMemory({ content: 'm' });
        await sessions.linkMemory(first.id, saved.id);

        expect(await rejection(sessions.linkMemory(second.id, saved.id))).toMatchObject({ code: 'P2002' });
      });
    });

    describe('listSessions', () => {
      it('lists only the user sessions, latest message first, with total', async () => {
        const user = await seedUser(ctx.prisma);
        const other = await seedUser(ctx.prisma);
        await makeSession(user.id, { title: 'old', lastMessageAt: new Date(BASE) });
        await makeSession(user.id, { title: 'new', lastMessageAt: new Date(BASE + 2000) });
        await makeSession(user.id, { title: 'mid', lastMessageAt: new Date(BASE + 1000) });
        await makeSession(other.id, { title: 'foreign', lastMessageAt: new Date(BASE + 5000) });

        const result = await sessions.listSessions(user.id);

        expect(result.items.map((s) => s.title)).toEqual(['new', 'mid', 'old']);
        expect(result).toMatchObject({ total: 3, page: 1, pageSize: 20 });
      });

      it('pages through the sessions', async () => {
        const user = await seedUser(ctx.prisma);
        for (let i = 0; i < 3; i++) await makeSession(user.id, { title: `s${i}`, lastMessageAt: new Date(BASE + i * 1000) });

        const page2 = await sessions.listSessions(user.id, 2, 2);

        expect(page2.items.map((s) => s.title)).toEqual(['s0']);
        expect(page2).toMatchObject({ total: 3, page: 2, pageSize: 2 });
      });

      it('returns an empty list for a user without sessions', async () => {
        const user = await seedUser(ctx.prisma);

        expect(await sessions.listSessions(user.id)).toMatchObject({ items: [], total: 0 });
      });
    });

    describe('listMessages', () => {
      it('lists the messages oldest first with paging', async () => {
        const user = await seedUser(ctx.prisma);
        const session = await makeSession(user.id);
        await makeMessage(session.id, 2, ChatRole.USER, 'third');
        await makeMessage(session.id, 0, ChatRole.USER, 'first');
        await makeMessage(session.id, 1, ChatRole.MODEL, 'second');

        const all = await sessions.listMessages(user.id, session.id);
        const page = await sessions.listMessages(user.id, session.id, 2, 2);

        expect(all.items.map((m) => m.content)).toEqual(['first', 'second', 'third']);
        expect(all.total).toBe(3);
        expect(page.items.map((m) => m.content)).toEqual(['third']);
      });

      it('returns 404 for another user session', async () => {
        const owner = await seedUser(ctx.prisma);
        const other = await seedUser(ctx.prisma);
        const foreign = await makeSession(owner.id);

        await expect(sessions.listMessages(other.id, foreign.id)).rejects.toBeInstanceOf(NotFoundException);
      });

      it('returns 404 for an unknown session', async () => {
        const user = await seedUser(ctx.prisma);

        await expect(sessions.listMessages(user.id, MISSING)).rejects.toBeInstanceOf(NotFoundException);
      });
    });

    describe('findOwnMessage', () => {
      it('returns the message with its session and character', async () => {
        const user = await seedUser(ctx.prisma);
        const character = await seedCharacter(ctx.prisma, { name: 'Mika' });
        const session = await makeSession(user.id, { characterId: character.id });
        const message = await makeMessage(session.id, 0, ChatRole.MODEL, 'hello');

        const found = await sessions.findOwnMessage(user.id, message.id);

        expect(found.content).toBe('hello');
        expect(found.session.character?.name).toBe('Mika');
      });

      it('returns 404 for another user message', async () => {
        const owner = await seedUser(ctx.prisma);
        const other = await seedUser(ctx.prisma);
        const session = await makeSession(owner.id);
        const message = await makeMessage(session.id, 0, ChatRole.MODEL, 'secret');

        await expect(sessions.findOwnMessage(other.id, message.id)).rejects.toBeInstanceOf(NotFoundException);
      });

      it('returns 404 for an unknown message', async () => {
        const user = await seedUser(ctx.prisma);

        await expect(sessions.findOwnMessage(user.id, MISSING)).rejects.toBeInstanceOf(NotFoundException);
      });
    });

    describe('deleteSession', () => {
      it('deletes the session and its messages but keeps the memories created from them', async () => {
        const user = await seedUser(ctx.prisma);
        const session = await makeSession(user.id);
        const message = await makeMessage(session.id, 0, ChatRole.USER, 'remember');
        const saved = await memory.saveMemory({ content: 'remember' });
        await sessions.linkMemory(message.id, saved.id);

        expect(await sessions.deleteSession(user.id, session.id)).toEqual({ success: true });

        expect(await ctx.prisma.chatSession.count()).toBe(0);
        expect(await ctx.prisma.chatMessage.count()).toBe(0);
        expect(await ctx.prisma.aiMemory.count({ where: { id: saved.id } })).toBe(1);
      });

      it('returns 404 for another user session and deletes nothing', async () => {
        const owner = await seedUser(ctx.prisma);
        const other = await seedUser(ctx.prisma);
        const session = await makeSession(owner.id);
        await makeMessage(session.id, 0, ChatRole.USER, 'keep');

        await expect(sessions.deleteSession(other.id, session.id)).rejects.toBeInstanceOf(NotFoundException);

        expect(await ctx.prisma.chatSession.count()).toBe(1);
        expect(await ctx.prisma.chatMessage.count()).toBe(1);
      });

      it('returns 404 for an unknown session', async () => {
        const user = await seedUser(ctx.prisma);

        await expect(sessions.deleteSession(user.id, MISSING)).rejects.toBeInstanceOf(NotFoundException);
      });
    });
  });

  // ---------------------------------------------------------------- AgentService.chatStream

  describe('AgentService.chatStream', () => {
    const stream = async (userId: string, dto: Partial<ChatStreamDto>) => {
      const observable = await agent.chatStream(userId, { message: 'hello', ...dto } as ChatStreamDto);
      const events = await lastValueFrom(observable.pipe(toArray()));
      return events.map((e) => JSON.parse(e.data) as { type: string; [key: string]: any });
    };
    const textOf = (frames: { type: string; content?: string }[]) =>
      frames
        .filter((f) => f.type === 'text')
        .map((f) => f.content)
        .join('');
    const types = (frames: { type: string }[]) => frames.map((f) => f.type);
    const instructionOf = (callIndex = 0) => ctx.genAi.create.mock.calls[callIndex][0].config.systemInstruction as string;
    const withCharacter = (data: Record<string, unknown> = {}) =>
      ctx.prisma.character.create({
        data: {
          name: 'Mika',
          voiceId: 'v1',
          personas: { create: [{ type: 'TONE', value: 'playful and warm' }, { type: 'IDENTITY', value: 'a cat girl' }] },
          ...data,
        },
      });

    describe('session handling', () => {
      it('emits the session frame first, then text, then done, and persists both messages', async () => {
        const user = await seedUser(ctx.prisma);
        const character = await withCharacter();
        ctx.genAi.script.push(chunkBySize(replyJson('Hi there', 'jp'), 18));

        const frames = await stream(user.id, { message: 'hello bot', characterId: character.id });

        expect(types(frames)[0]).toBe('session');
        expect(types(frames).filter((t) => t === 'text').length).toBeGreaterThan(1);
        expect(types(frames).slice(-2)).toEqual(['reply', 'done']);
        expect(textOf(frames)).toBe('Hi there');
        const session = await ctx.prisma.chatSession.findUniqueOrThrow({ where: { id: frames[0].sessionId } });
        expect(session).toMatchObject({ userId: user.id, characterId: character.id, title: 'hello bot' });
        const stored = await messagesOf(session.id);
        expect(stored.map((m) => [m.role, m.content])).toEqual(
          expect.arrayContaining([
            ['USER', 'hello bot'],
            ['MODEL', 'Hi there'],
          ]),
        );
        expect(stored).toHaveLength(2);
        expect(stored.find((m) => m.role === 'MODEL')!.toolCalls).toBeNull();
      });

      it('rejects a new session without characterId with 400 and creates nothing', async () => {
        const user = await seedUser(ctx.prisma);

        await expect(stream(user.id, {})).rejects.toBeInstanceOf(BadRequestException);

        expect(await ctx.prisma.chatSession.count()).toBe(0);
        expect(ctx.genAi.create).not.toHaveBeenCalled();
      });

      it('rejects an unknown characterId with 404, creates nothing and does not call the model', async () => {
        const user = await seedUser(ctx.prisma);

        await expect(stream(user.id, { characterId: MISSING })).rejects.toBeInstanceOf(NotFoundException);

        expect(await ctx.prisma.chatSession.count()).toBe(0);
        expect(await ctx.prisma.chatMessage.count()).toBe(0);
        expect(ctx.genAi.create).not.toHaveBeenCalled();
      });

      it('rejects an unknown sessionId with 404 without calling the model', async () => {
        const user = await seedUser(ctx.prisma);

        await expect(stream(user.id, { sessionId: MISSING })).rejects.toBeInstanceOf(NotFoundException);

        expect(ctx.genAi.create).not.toHaveBeenCalled();
      });

      it('rejects another user session with 404 and stores nothing', async () => {
        const owner = await seedUser(ctx.prisma);
        const other = await seedUser(ctx.prisma);
        const session = await makeSession(owner.id);

        await expect(stream(other.id, { sessionId: session.id })).rejects.toBeInstanceOf(NotFoundException);

        expect(await ctx.prisma.chatMessage.count()).toBe(0);
        expect(ctx.genAi.create).not.toHaveBeenCalled();
      });

      it('continues an existing session with its stored character and ignores dto.characterId', async () => {
        const user = await seedUser(ctx.prisma);
        const stored = await withCharacter({ name: 'StoredName' });
        const other = await withCharacter({ name: 'OtherName' });
        const session = await makeSession(user.id, { characterId: stored.id });
        ctx.genAi.script.push(reply('ok'));

        const frames = await stream(user.id, { sessionId: session.id, characterId: other.id });

        expect(frames[0]).toEqual({ type: 'session', sessionId: session.id });
        expect(instructionOf()).toContain('StoredName');
        expect(instructionOf()).not.toContain('OtherName');
        expect(await ctx.prisma.chatSession.count()).toBe(1);
      });

      it('continues an existing session without characterId in the request', async () => {
        const user = await seedUser(ctx.prisma);
        const session = await makeSession(user.id);
        ctx.genAi.script.push(reply('ok'));

        const frames = await stream(user.id, { sessionId: session.id });

        expect(types(frames)).toEqual(['session', 'text', 'reply', 'done']);
      });

      it('passes the earlier messages of the session as history', async () => {
        const user = await seedUser(ctx.prisma);
        const session = await makeSession(user.id);
        await makeMessage(session.id, 0, ChatRole.USER, 'earlier question');
        await makeMessage(session.id, 1, ChatRole.MODEL, 'earlier answer');
        ctx.genAi.script.push(reply('ok'));

        await stream(user.id, { sessionId: session.id, message: 'follow up' });

        expect(ctx.genAi.create.mock.calls[0][0].history).toEqual([
          { role: 'user', parts: [{ text: 'earlier question' }] },
          { role: 'model', parts: [{ text: 'earlier answer' }] },
        ]);
        expect(ctx.genAi.sendMessageStream).toHaveBeenCalledWith({ message: 'follow up' });
      });

      it('moves last_message_at forward', async () => {
        const user = await seedUser(ctx.prisma);
        const old = new Date('2020-01-01T00:00:00Z');
        const session = await makeSession(user.id, { lastMessageAt: old });

        await stream(user.id, { sessionId: session.id });

        const after = await ctx.prisma.chatSession.findUniqueOrThrow({ where: { id: session.id } });
        expect(after.lastMessageAt.getTime()).toBeGreaterThan(old.getTime() + 86_400_000);
      });
    });

    describe('system instruction', () => {
      it('contains the character name, its personas and the custom memory rule', async () => {
        const user = await seedUser(ctx.prisma);
        const character = await withCharacter({ memoryRule: 'Only remember birthdays.' });

        await stream(user.id, { characterId: character.id });

        const instruction = instructionOf();
        expect(instruction).toContain('Tên nhân vật: Mika');
        expect(instruction).toContain('[TONE]: playful and warm');
        expect(instruction).toContain('[IDENTITY]: a cat girl');
        expect(instruction).toContain('Only remember birthdays.');
        expect(instruction).not.toContain(DEFAULT_MEMORY_RULE);
      });

      it('starts with the default system prompt and puts the persona text after it', async () => {
        const user = await seedUser(ctx.prisma);
        const character = await withCharacter();

        await stream(user.id, { characterId: character.id });

        const instruction = instructionOf();
        expect(instruction.startsWith(prompt.systemPrompt)).toBe(true);
        expect(instruction.indexOf('Tên nhân vật: Mika')).toBeGreaterThanOrEqual(prompt.systemPrompt.length);
      });

      it('uses the default memory rule when the character has none', async () => {
        const user = await seedUser(ctx.prisma);
        const character = await withCharacter({ memoryRule: null });

        await stream(user.id, { characterId: character.id });

        expect(instructionOf()).toContain(DEFAULT_MEMORY_RULE);
      });

      it('uses the generic prompt for a character without personas', async () => {
        const user = await seedUser(ctx.prisma);
        const character = await seedCharacter(ctx.prisma, { name: 'Bare' });

        await stream(user.id, { characterId: character.id });

        expect(instructionOf().startsWith(prompt.systemPrompt)).toBe(true);
        expect(instructionOf()).not.toContain('Tên nhân vật');
      });

      it('falls back to the generic prompt and the default rule when the session character was deleted', async () => {
        const user = await seedUser(ctx.prisma);
        const character = await withCharacter({ memoryRule: 'custom rule' });
        const session = await makeSession(user.id, { characterId: character.id });
        await ctx.prisma.character.delete({ where: { id: character.id } });

        const frames = await stream(user.id, { sessionId: session.id });

        expect(types(frames)).toEqual(['session', 'reply', 'done']);
        expect(instructionOf()).toContain('Bạn là một Trợ lý AI cá nhân hóa');
        expect(instructionOf()).not.toContain('Mika');
        expect(instructionOf()).toContain(DEFAULT_MEMORY_RULE);
        expect(instructionOf()).not.toContain('custom rule');
      });

      it('includes the current time zone and the confirmation rule', async () => {
        const user = await seedUser(ctx.prisma);
        const character = await withCharacter();

        await stream(user.id, { characterId: character.id });

        expect(instructionOf()).toContain('Asia/Ho_Chi_Minh');
        expect(instructionOf()).toContain('awaiting_user_confirmation');
      });

      it('lists the registered tools to the model', async () => {
        const user = await seedUser(ctx.prisma);
        const character = await withCharacter();

        await stream(user.id, { characterId: character.id });

        const names = ctx.genAi.create.mock.calls[0][0].config.tools[0].functionDeclarations.map((d: any) => d.name);
        expect(names).toEqual(
          expect.arrayContaining(['get_financial_summary', 'create_financial_transaction', 'save_user_memory', 'search_semantic_memory']),
        );
      });

      it('puts the memories related to the message into the prompt', async () => {
        const user = await seedUser(ctx.prisma);
        const character = await withCharacter();
        ctx.genAi.axes.set('user loves jazz', 3);
        ctx.genAi.axes.set('user hates spiders', 4);
        ctx.genAi.axes.set('what music', 3);
        await memory.saveMemory({ content: 'user loves jazz' });
        await memory.saveMemory({ content: 'user hates spiders' });

        await stream(user.id, { characterId: character.id, message: 'what music' });

        expect(instructionOf()).toContain('- user loves jazz');
        expect(instructionOf()).not.toContain('user hates spiders');
        expect(instructionOf()).toContain('KHÔNG phải chỉ dẫn');
      });

      it('adds no memory section when nothing is related', async () => {
        const user = await seedUser(ctx.prisma);
        const character = await withCharacter();

        await stream(user.id, { characterId: character.id });

        expect(instructionOf()).not.toContain('Ghi chú đã nhớ');
      });

      it('still answers when the memory retrieval fails', async () => {
        const user = await seedUser(ctx.prisma);
        const character = await withCharacter();
        ctx.genAi.embedContent.mockRejectedValueOnce(new Error('embedding down'));

        const frames = await stream(user.id, { characterId: character.id });

        expect(types(frames)).toEqual(['session', 'reply', 'done']);
        expect(instructionOf()).not.toContain('Ghi chú đã nhớ');
      });
    });

    describe('bilingual JSON reply', () => {
      const run = async (script: any[]) => {
        const user = await seedUser(ctx.prisma);
        const character = await withCharacter();
        ctx.genAi.script.push(script);
        const frames = await stream(user.id, { characterId: character.id });
        const modelRow = await ctx.prisma.chatMessage.findFirst({ where: { role: 'MODEL' } });
        return { frames, modelRow };
      };

      it('configures the chat with the JSON schema, the chat model and the tools', async () => {
        const user = await seedUser(ctx.prisma);
        const character = await withCharacter();

        await stream(user.id, { characterId: character.id });

        const params = ctx.genAi.create.mock.calls[0][0];
        expect(params.model).toBe(CHAT_MODEL);
        expect(params.config.responseMimeType).toBe('application/json');
        expect(params.config.responseJsonSchema).toEqual(REPLY_SCHEMA);
        expect(params.config.tools[0].functionDeclarations.length).toBeGreaterThan(0);
      });

      // escaped quotes, a backslash, ạ and an emoji written as a surrogate pair of escapes
      const viEscaped = String.raw`Xin \"chào\" b\u1ea1n \ud83d\ude00 \\ ok`;
      const viDecoded = 'Xin "chào" bạn 😀 \\ ok';
      const raw = `{"message_vi":"${viEscaped}","message_jp":"こんにちは\\n世界"}`;

      it.each([1, 2, 3, 5, 7, 11, 1000])(
        'streams exactly message_vi and stores both texts when the reply is cut into %i-character chunks',
        async (size) => {
          const { frames, modelRow } = await run(chunkBySize(raw, size));

          expect(textOf(frames)).toBe(viDecoded);
          expect(modelRow).toMatchObject({ content: viDecoded, contentJp: 'こんにちは\n世界' });
          const replyFrame = frames.find((f) => f.type === 'reply')!;
          expect(replyFrame).toEqual({ type: 'reply', messageId: modelRow!.id, contentJp: 'こんにちは\n世界' });
          expect(types(frames).indexOf('reply')).toBeLessThan(types(frames).indexOf('done'));
          expect(types(frames).at(-1)).toBe('done');
        },
      );

      it('survives cuts inside an escaped quote, inside a \\u escape and between the two surrogates', async () => {
        const cuts = [
          raw.indexOf('\\"') + 1, // between backslash and quote
          raw.indexOf('\\u1ea1') + 3, // inside ạ
          raw.indexOf('\\ude00'), // between the surrogate escapes
          raw.indexOf('\\ude00') + 4,
        ].sort((a, b) => a - b);
        expect(cuts[0]).toBeGreaterThan(0);

        const { frames, modelRow } = await run(chunkAt(raw, ...cuts));

        expect(textOf(frames)).toBe(viDecoded);
        // contentJp proves the JSON parsed, not the fallback path
        expect(modelRow).toMatchObject({ content: viDecoded, contentJp: 'こんにちは\n世界' });
      });

      it('streams only message_vi when message_jp comes first', async () => {
        const jpFirst = JSON.stringify({ message_jp: 'JP ONLY', message_vi: 'chỉ tiếng Việt' });

        const { frames, modelRow } = await run(chunkBySize(jpFirst, 4));

        expect(textOf(frames)).toBe('chỉ tiếng Việt');
        expect(modelRow).toMatchObject({ content: 'chỉ tiếng Việt', contentJp: 'JP ONLY' });
      });

      it('completes the turn with the raw text and no Japanese when the reply is not valid JSON', async () => {
        const { frames, modelRow } = await run([text('just plain text, no json')]);

        expect(types(frames)).not.toContain('error');
        expect(types(frames).at(-1)).toBe('done');
        expect(textOf(frames)).toBe('just plain text, no json');
        expect(modelRow).toMatchObject({ content: 'just plain text, no json', contentJp: null });
        expect(frames.find((f) => f.type === 'reply')).toEqual({ type: 'reply', messageId: modelRow!.id, contentJp: null });
      });

      it('never shows or stores the raw JSON when it parses but has no message_vi', async () => {
        const { frames, modelRow } = await run([text('{"message_jp":"日本語だけ"}')]);

        expect(textOf(frames)).toBe('');
        expect(modelRow).toMatchObject({ content: '', contentJp: '日本語だけ' });
      });

      it('separates the replies of two rounds with a blank line', async () => {
        const user = await seedUser(ctx.prisma);
        const character = await withCharacter();
        ctx.genAi.script.push(
          [text(replyJson('Để mình kiểm tra.', '確認します。')), calls({ id: 'c1', name: 'get_financial_summary', args: {} })],
          [text(replyJson('Có tiền', 'お金があります'))],
        );

        await stream(user.id, { characterId: character.id });

        const modelRow = await ctx.prisma.chatMessage.findFirstOrThrow({ where: { role: 'MODEL' } });
        expect(modelRow).toMatchObject({
          content: 'Để mình kiểm tra.\n\nCó tiền',
          contentJp: '確認します。\n\nお金があります',
        });
      });

      it('keeps the already streamed Vietnamese when the JSON is cut off', async () => {
        const { frames, modelRow } = await run([text('{"message_vi":"half an ans'), text('wer", "message_jp": "oops')]);

        expect(types(frames)).not.toContain('error');
        expect(textOf(frames)).toBe('half an answer');
        expect(modelRow).toMatchObject({ content: 'half an answer', contentJp: null });
      });

      it('runs a tool round and then saves the JSON reply of the next round', async () => {
        const user = await seedUser(ctx.prisma);
        const character = await withCharacter();
        ctx.genAi.script.push([calls({ id: 'c1', name: 'get_financial_summary', args: {} })], chunkBySize(replyJson('Có tiền', 'お金があります'), 20));

        const frames = await stream(user.id, { characterId: character.id });

        expect(types(frames).filter((t) => t !== 'text')).toEqual(['session', 'tool_call', 'tool_result', 'reply', 'done']);
        expect(textOf(frames)).toBe('Có tiền');
        const modelRow = await ctx.prisma.chatMessage.findFirstOrThrow({ where: { role: 'MODEL' } });
        expect(modelRow).toMatchObject({ content: 'Có tiền', contentJp: 'お金があります' });
        expect(modelRow.toolCalls).toMatchObject([{ tool: 'get_financial_summary' }]);
      });

      it('stores a blank Japanese text as null', async () => {
        const { modelRow } = await run(reply('chỉ tiếng Việt', ''));

        expect(modelRow).toMatchObject({ content: 'chỉ tiếng Việt', contentJp: null });
      });
    });

    describe('read tools', () => {
      it('runs get_financial_summary against real finance data and feeds the result back to the model', async () => {
        const user = await seedUser(ctx.prisma);
        const character = await withCharacter();
        await seedAccount(ctx.prisma, { accountName: 'Savings', cachedBalance: 1234567 });
        ctx.genAi.script.push([calls({ id: 'c1', name: 'get_financial_summary', args: {} })], reply('You have money'));

        const frames = await stream(user.id, { characterId: character.id });

        expect(types(frames)).toEqual(['session', 'tool_call', 'tool_result', 'text', 'reply', 'done']);
        expect(frames[1]).toMatchObject({ tool: 'get_financial_summary' });
        const result = frames[2].result;
        expect(result.accounts).toHaveLength(1);
        expect(result.accounts[0]).toMatchObject({ accountName: 'Savings' });
        expect(Number(result.accounts[0].cachedBalance)).toBe(1234567);
        // the second model round answers the function call with the same result
        const secondMessage = ctx.genAi.sendMessageStream.mock.calls[1][0].message;
        expect(secondMessage).toEqual([
          { functionResponse: { id: 'c1', name: 'get_financial_summary', response: { result } } },
        ]);
      });

      it('stores the tool calls with the model message', async () => {
        const user = await seedUser(ctx.prisma);
        const character = await withCharacter();
        await seedAccount(ctx.prisma);
        ctx.genAi.script.push([calls({ name: 'get_financial_summary', args: {} })], reply('done'));

        const frames = await stream(user.id, { characterId: character.id });

        const model = (await messagesOf(frames[0].sessionId)).find((m) => m.role === 'MODEL')!;
        expect(model.content).toBe('done');
        expect(model.toolCalls).toMatchObject([{ tool: 'get_financial_summary', result: { accounts: [{ accountName: 'Main' }] } }]);
      });

      it('answers all function calls of one round in a single message', async () => {
        const user = await seedUser(ctx.prisma);
        const character = await withCharacter();
        ctx.genAi.script.push(
          [calls({ id: 'a', name: 'get_financial_summary', args: {} }, { id: 'b', name: 'get_financial_summary', args: {} })],
          reply('ok'),
        );

        await stream(user.id, { characterId: character.id });

        expect(ctx.genAi.sendMessageStream).toHaveBeenCalledTimes(2);
        expect(ctx.genAi.sendMessageStream.mock.calls[1][0].message.map((p: any) => p.functionResponse.id)).toEqual(['a', 'b']);
      });

      it('reports an unknown tool to the model instead of failing the turn', async () => {
        const user = await seedUser(ctx.prisma);
        const character = await withCharacter();
        ctx.genAi.script.push([calls({ id: 'x', name: 'does_not_exist', args: {} })], reply('sorry'));

        const frames = await stream(user.id, { characterId: character.id });

        expect(types(frames)).toEqual(['session', 'text', 'reply', 'done']);
        expect(ctx.genAi.sendMessageStream.mock.calls[1][0].message[0].functionResponse.response).toEqual({
          error: 'unknown tool: does_not_exist',
        });
      });

      it('reports invalid arguments to the model and does not ask for confirmation', async () => {
        const user = await seedUser(ctx.prisma);
        const character = await withCharacter();
        ctx.genAi.script.push(
          [calls({ id: 'x', name: 'create_financial_transaction', args: { amount: -5, unexpected: true } })],
          reply('sorry'),
        );

        const frames = await stream(user.id, { characterId: character.id });

        expect(types(frames)).toEqual(['session', 'text', 'reply', 'done']);
        expect(ctx.genAi.sendMessageStream.mock.calls[1][0].message[0].functionResponse.response).toMatchObject({
          error: 'invalid arguments',
        });
      });
    });

    describe('write tools and confirmation', () => {
      const proposeTransaction = async (accountId: string) => {
        const user = await seedUser(ctx.prisma);
        const character = await withCharacter();
        ctx.genAi.script.push(
          [calls({ id: 'w1', name: 'create_financial_transaction', args: { accountId, amount: 50000, type: 'EXPENSE', note: 'lunch' } })],
          reply('Please confirm'),
        );
        const frames = await stream(user.id, { characterId: character.id });
        const confirmation = frames.find((f) => f.type === 'confirmation_required')!;
        return { user, frames, confirmation };
      };

      it('emits confirmation_required with an actionId and writes nothing', async () => {
        const account = await seedAccount(ctx.prisma, { cachedBalance: 1000000 });

        const { frames, confirmation } = await proposeTransaction(account.id);

        expect(types(frames)).toEqual(['session', 'confirmation_required', 'text', 'reply', 'done']);
        expect(confirmation).toMatchObject({ tool: 'create_financial_transaction', args: { accountId: account.id, amount: 50000 } });
        expect(typeof confirmation.actionId).toBe('string');
        expect(await ctx.prisma.transaction.count()).toBe(0);
        expect(Number((await ctx.prisma.bankAccount.findUniqueOrThrow({ where: { id: account.id } })).cachedBalance)).toBe(1000000);
        expect(ctx.genAi.sendMessageStream.mock.calls[1][0].message[0].functionResponse.response).toEqual({
          status: 'awaiting_user_confirmation',
        });
      });

      it('stores the action id in the model message tool calls', async () => {
        const account = await seedAccount(ctx.prisma);

        const { frames, confirmation } = await proposeTransaction(account.id);

        const model = (await messagesOf(frames[0].sessionId)).find((m) => m.role === 'MODEL')!;
        expect(model.toolCalls).toMatchObject([{ tool: 'create_financial_transaction', actionId: confirmation.actionId }]);
      });

      it('confirmAction executes the stored command exactly once', async () => {
        const account = await seedAccount(ctx.prisma, { cachedBalance: 1000000 });
        const { confirmation } = await proposeTransaction(account.id);

        const result = await agent.confirmAction(confirmation.actionId);

        expect(result.tool).toBe('create_financial_transaction');
        expect(await ctx.prisma.transaction.count()).toBe(1);
        expect(await ctx.prisma.transaction.findFirstOrThrow()).toMatchObject({ accountId: account.id, type: 'EXPENSE', note: 'lunch' });
        expect(Number((await ctx.prisma.bankAccount.findUniqueOrThrow({ where: { id: account.id } })).cachedBalance)).toBe(950000);

        await expect(agent.confirmAction(confirmation.actionId)).rejects.toBeInstanceOf(NotFoundException);
        expect(await ctx.prisma.transaction.count()).toBe(1);
      });

      it('confirmAction surfaces a failing command and does not allow a retry', async () => {
        const account = await seedAccount(ctx.prisma);
        const { confirmation } = await proposeTransaction(account.id);
        await ctx.prisma.bankAccount.update({ where: { id: account.id }, data: { isActive: false } });

        await expect(agent.confirmAction(confirmation.actionId)).rejects.toBeInstanceOf(BadRequestException);

        expect(await ctx.prisma.transaction.count()).toBe(0);
        await expect(agent.confirmAction(confirmation.actionId)).rejects.toBeInstanceOf(NotFoundException);
      });

      it('discardAction drops the command; it cannot be confirmed afterwards', async () => {
        const account = await seedAccount(ctx.prisma);
        const { confirmation } = await proposeTransaction(account.id);

        expect(agent.discardAction(confirmation.actionId)).toEqual({ success: true });

        await expect(agent.confirmAction(confirmation.actionId)).rejects.toBeInstanceOf(NotFoundException);
        expect(await ctx.prisma.transaction.count()).toBe(0);
        expect(() => agent.discardAction(confirmation.actionId)).toThrow(NotFoundException);
      });

      it('rejects an unknown action id on confirm and discard', async () => {
        await expect(agent.confirmAction(MISSING)).rejects.toBeInstanceOf(NotFoundException);
        expect(() => agent.discardAction(MISSING)).toThrow(NotFoundException);
      });

      it('rejects an action after its 5 minute lifetime', async () => {
        const account = await seedAccount(ctx.prisma);
        const { confirmation } = await proposeTransaction(account.id);

        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(Date.now() + 5 * 60 * 1000 + 1000);

        await expect(agent.confirmAction(confirmation.actionId)).rejects.toBeInstanceOf(NotFoundException);
        expect(await ctx.prisma.transaction.count()).toBe(0);
      });

      it('accepts an action just inside its lifetime', async () => {
        const account = await seedAccount(ctx.prisma);
        const { confirmation } = await proposeTransaction(account.id);

        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(Date.now() + 5 * 60 * 1000 - 5000);

        await agent.confirmAction(confirmation.actionId);
        expect(await ctx.prisma.transaction.count()).toBe(1);
      });
    });

    describe('tool round limit', () => {
      const readRound = () => [calls({ name: 'get_financial_summary', args: {} })];

      it('stops after 5 tool rounds with an error frame and stores no model message', async () => {
        const user = await seedUser(ctx.prisma);
        const character = await withCharacter();
        for (let i = 0; i < 6; i++) ctx.genAi.script.push(readRound());

        const frames = await stream(user.id, { characterId: character.id });

        expect(frames.at(-1)).toMatchObject({ type: 'error' });
        expect(frames.at(-1)!.message).toContain('5');
        expect(types(frames)).not.toContain('done');
        expect(ctx.genAi.sendMessageStream).toHaveBeenCalledTimes(6);
        const stored = await messagesOf(frames[0].sessionId);
        expect(stored.map((m) => m.role)).toEqual(['USER']);
      });

      it('allows exactly 5 tool rounds followed by an answer', async () => {
        const user = await seedUser(ctx.prisma);
        const character = await withCharacter();
        for (let i = 0; i < 5; i++) ctx.genAi.script.push(readRound());
        ctx.genAi.script.push(reply('finally'));

        const frames = await stream(user.id, { characterId: character.id });

        expect(frames.at(-1)).toEqual({ type: 'done' });
        expect(types(frames)).not.toContain('error');
        const model = (await messagesOf(frames[0].sessionId)).find((m) => m.role === 'MODEL')!;
        expect(model.content).toBe('finally');
        expect(model.toolCalls).toHaveLength(5);
      });
    });

    describe('model failure', () => {
      it('emits an error frame, keeps the user message and stores no model message', async () => {
        const user = await seedUser(ctx.prisma);
        const character = await withCharacter();
        ctx.genAi.sendMessageStream.mockRejectedValueOnce(httpError(500));

        const frames = await stream(user.id, { characterId: character.id, message: 'are you there' });

        expect(types(frames)).toEqual(['session', 'error']);
        expect(frames[1].message).toBe('HTTP 500');
        const stored = await messagesOf(frames[0].sessionId);
        expect(stored.map((m) => [m.role, m.content])).toEqual([['USER', 'are you there']]);
      });

      it('does not store a half answer when the stream breaks after some text', async () => {
        const user = await seedUser(ctx.prisma);
        const character = await withCharacter();
        ctx.genAi.sendMessageStream.mockImplementationOnce(async () =>
          (async function* () {
            yield text('{"message_vi":"partial ');
            throw new Error('stream broke');
          })(),
        );

        const frames = await stream(user.id, { characterId: character.id });

        expect(types(frames)).toEqual(['session', 'text', 'error']);
        const stored = await messagesOf(frames[0].sessionId);
        expect(stored.map((m) => m.role)).toEqual(['USER']);
      });
    });

    describe('ordering of writes', () => {
      it('stores the user message before the model is called and the model answer only at the end', async () => {
        const user = await seedUser(ctx.prisma);
        const character = await withCharacter();
        let seenAtModelCall: string[] = [];
        ctx.genAi.sendMessageStream.mockImplementationOnce(async () => {
          seenAtModelCall = (await ctx.prisma.chatMessage.findMany()).map((m) => `${m.role}:${m.content}`);
          return (async function* () {
            yield text(replyJson('answer', 'jp'));
            // still no model message while the stream is open
            seenAtModelCall.push(`open:${await ctx.prisma.chatMessage.count({ where: { role: 'MODEL' } })}`);
          })();
        });

        await stream(user.id, { characterId: character.id, message: 'question' });

        expect(seenAtModelCall).toEqual(['USER:question', 'open:0']);
        expect(await ctx.prisma.chatMessage.count({ where: { role: 'MODEL' } })).toBe(1);
      });
    });

    describe('save_user_memory', () => {
      it('creates CHAT memories and links only the first one to the user message', async () => {
        const user = await seedUser(ctx.prisma);
        const character = await withCharacter();
        ctx.genAi.script.push(
          [
            calls(
              { id: 'm1', name: 'save_user_memory', args: { content: 'user likes tea', category: 'PREFERENCE' } },
              { id: 'm2', name: 'save_user_memory', args: { content: 'user has a dog' } },
            ),
          ],
          reply('noted'),
        );

        const frames = await stream(user.id, { characterId: character.id, message: 'I like tea and I have a dog' });

        expect(types(frames)).toEqual(['session', 'tool_call', 'tool_result', 'tool_call', 'tool_result', 'text', 'reply', 'done']);
        const tea = await ctx.prisma.aiMemory.findFirstOrThrow({ where: { content: 'user likes tea' } });
        const dog = await ctx.prisma.aiMemory.findFirstOrThrow({ where: { content: 'user has a dog' } });
        expect(tea).toMatchObject({ source: 'CHAT', category: 'PREFERENCE' });
        expect(dog).toMatchObject({ source: 'CHAT', category: 'GENERAL' });
        const linked = await ctx.prisma.chatMessage.findMany({ where: { memoryId: { not: null } } });
        expect(linked).toHaveLength(1);
        expect(linked[0]).toMatchObject({ role: 'USER', content: 'I like tea and I have a dog', memoryId: tea.id });
      });

      it('does not link anything when the memory could not be saved', async () => {
        const user = await seedUser(ctx.prisma);
        const character = await withCharacter();
        ctx.genAi.script.push([calls({ id: 'm1', name: 'save_user_memory', args: { content: 'user likes tea' } })], reply('hmm'));
        // pre-turn retrieval uses the first embedding call, the tool uses the second
        ctx.genAi.embedContent.mockImplementationOnce(async () => ({ embeddings: [{ values: Array.from({ length: 1536 }, () => 0) }] }));
        ctx.genAi.embedContent.mockRejectedValueOnce(new Error('embedding down'));

        const frames = await stream(user.id, { characterId: character.id });

        expect(types(frames)).toEqual(['session', 'tool_call', 'text', 'reply', 'done']);
        expect(ctx.genAi.sendMessageStream.mock.calls[1][0].message[0].functionResponse.response).toEqual({
          error: 'embedding down',
        });
        expect(await ctx.prisma.aiMemory.count()).toBe(0);
        expect(await ctx.prisma.chatMessage.count({ where: { memoryId: { not: null } } })).toBe(0);
      });
    });

    describe('client disconnect', () => {
      it('stops the loop, keeps the user message and stores no model message', async () => {
        const user = await seedUser(ctx.prisma);
        const character = await withCharacter();
        const run = vi.spyOn(agent as any, 'runChat');
        ctx.genAi.sendMessageStream.mockImplementationOnce(async () =>
          (async function* () {
            yield text('first chunk');
            yield text('second chunk');
          })(),
        );
        const observable = await agent.chatStream(user.id, { message: 'hi', characterId: character.id } as ChatStreamDto);
        const received: any[] = [];

        // the session frame is emitted synchronously on subscribe; runChat only continues after an await
        const subscription = observable.subscribe((event) => received.push(JSON.parse(event.data)));
        subscription.unsubscribe();
        // wait for the whole turn to end, so a missing cancel guard would have stored a MODEL message by now
        await (run.mock.results[0].value as Promise<unknown>).catch(() => undefined);

        expect(received.map((f) => f.type)).toEqual(['session']);
        const session = await ctx.prisma.chatSession.findFirstOrThrow();
        expect((await messagesOf(session.id)).map((m) => m.role)).toEqual(['USER']);
      });
    });
  });
});

describe('ReplyStreamParser', () => {
  const feedAll = (raw: string, size: number) => {
    const parser = new ReplyStreamParser();
    let out = '';
    for (let i = 0; i < raw.length; i += size) out += parser.feed(raw.slice(i, i + size));
    return out;
  };
  const raw = '{ "message_jp" : "日本\\"語", "message_vi" : "a\\nb\\t\\/\\\\ \\u00e9 \\ud83d\\ude00 \\"q\\" end" }';
  const expected = 'a\nb\t/\\ é 😀 "q" end';

  it.each(Array.from({ length: 24 }, (_, i) => i + 1))('decodes message_vi from chunks of %i characters', (size) => {
    expect(feedAll(raw, size)).toBe(expected);
  });

  it('never emits a lone high surrogate at the end of a chunk', () => {
    const parser = new ReplyStreamParser();
    expect(parser.feed('{"message_vi":"\ud83d')).toBe('');
    expect(parser.feed('\ude00x"}')).toBe('😀x');
  });

  it('ignores a message_vi-looking value inside message_jp', () => {
    expect(feedAll('{"message_jp":"message_vi","message_vi":"ok"}', 3)).toBe('ok');
  });

  it('emits nothing for JSON without message_vi', () => {
    expect(feedAll('{"other":"x"}', 2)).toBe('');
  });
});
