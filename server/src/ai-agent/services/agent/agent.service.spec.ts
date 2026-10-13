import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { lastValueFrom, toArray } from 'rxjs';
import { AiUpdateEventDto } from '../../../calendar/dto/ai-update-event.dto';
import { CalendarTools } from '../../../calendar/calendar.tools';
import { AiCreateTransactionDto } from '../../../finance/dto/ai-create-transaction.dto';
import { AgentService, MAX_TOOL_ROUNDS } from './agent.service';
import { PendingActionStore } from './pending-action.store';

const text = (value: string) => ({
  candidates: [{ content: { parts: [{ text: value }] } }],
});
const calls = (...functionCalls: any[]) => ({ functionCalls });

/** A chat whose model turns are scripted; when the script runs out it repeats `fallback`. */
function build(script: any[][], fallback?: any[]) {
  const sendMessageStream = vi.fn(async (_params: any) => {
    const chunks = script.shift() ?? fallback ?? [text('')];
    return (async function* () {
      yield* chunks;
    })();
  });
  const genAi: any = { get: () => ({ chats: { create: () => ({ sendMessageStream }) } }) };
  const prisma: any = { character: { findFirst: vi.fn().mockResolvedValue(null) } };
  const memory: any = { searchMemory: vi.fn().mockResolvedValue([]) };
  const config: any = { get: (_key: string, fallbackValue: unknown) => fallbackValue };

  const service = new AgentService(
    prisma,
    config,
    genAi,
    memory,
    new PendingActionStore(),
    {} as any,
    {} as any,
    {} as any,
  );

  const register = (name: string, fn: (...a: any[]) => any, options: object = {}) => {
    const instance = { run: vi.fn(fn) };
    (service as any).toolsMap.set(name, {
      definition: { name },
      options: { name, description: '', ...options },
      instance,
      methodName: 'run',
    });
    return instance.run;
  };

  const run = async (message = 'xin chào') => {
    const frames = await lastValueFrom(service.chatStream({ message }).pipe(toArray()));
    return frames.map((frame) => JSON.parse(frame.data));
  };

  /** functionResponse parts sent back to the model on the n-th send (0 = the user message) */
  const sent = (n: number) =>
    sendMessageStream.mock.calls[n][0].message.map((p: any) => p.functionResponse);

  return { service, sendMessageStream, register, run, sent, memory };
}

describe('AgentService chat loop', () => {
  it('streams text chunks as separate frames and ends with done', async () => {
    const { run } = build([[text('Xin '), text('chào!')]]);
    expect(await run()).toEqual([
      { type: 'text', content: 'Xin ' },
      { type: 'text', content: 'chào!' },
      { type: 'done' },
    ]);
  });

  it('answers an unknown tool with an error response and terminates', async () => {
    const { run, sent, sendMessageStream } = build([
      [calls({ id: 'c1', name: 'no_such_tool', args: {} })],
      [text('Xin lỗi')],
    ]);

    const frames = await run();

    expect(sendMessageStream).toHaveBeenCalledTimes(2);
    expect(sent(1)[0]).toMatchObject({
      id: 'c1',
      name: 'no_such_tool',
      response: { error: 'unknown tool: no_such_tool' },
    });
    expect(frames.at(-1)).toEqual({ type: 'done' });
  });

  it('reports a throwing tool to the model and still reaches a final answer', async () => {
    const t = build([[calls({ name: 'boom', args: {} })], [text('Không làm được')]]);
    t.register('boom', () => {
      throw new Error('db down');
    });

    const frames = await t.run();

    expect(t.sent(1)[0].response).toEqual({ error: 'db down' });
    expect(frames.map((f) => f.type)).toEqual(['tool_call', 'text', 'done']);
  });

  it('sends all function responses of one turn together in one message', async () => {
    const t = build([
      [calls({ id: 'a', name: 'one', args: {} }), calls({ id: 'b', name: 'two', args: {} })],
      [text('xong')],
    ]);
    t.register('one', () => 1);
    t.register('two', () => 2);

    await t.run();

    expect(t.sendMessageStream).toHaveBeenCalledTimes(2);
    expect(t.sent(1)).toEqual([
      { id: 'a', name: 'one', response: { result: 1 } },
      { id: 'b', name: 'two', response: { result: 2 } },
    ]);
  });

  it(`stops a model that always calls a tool after ${MAX_TOOL_ROUNDS} rounds`, async () => {
    const t = build([], [calls({ name: 'loop', args: {} })]);
    const tool = t.register('loop', () => 'again');

    const frames = await t.run();

    expect(tool).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS);
    expect(frames.at(-1).type).toBe('error');
  });

  it('a failed memory lookup does not break the chat', async () => {
    const t = build([[text('ok')]]);
    t.memory.searchMemory.mockRejectedValue(new Error('no key'));
    expect((await t.run()).at(-1)).toEqual({ type: 'done' });
  });
});

describe('AgentService tool validation', () => {
  it('rejects invalid arguments without calling the tool', async () => {
    const t = build([
      [
        calls({
          name: 'create_financial_transaction',
          args: {
            accountId: '11111111-1111-4111-8111-111111111111',
            amount: -5,
            type: 'EXPENSE',
          },
        }),
      ],
      [text('Số tiền không hợp lệ')],
    ]);
    const tool = t.register('create_financial_transaction', () => 'created', {
      dto: AiCreateTransactionDto,
    });

    await t.run();

    expect(tool).not.toHaveBeenCalled();
    expect(t.sent(1)[0].response.error).toBe('invalid arguments');
  });

  it('rejects arguments the DTO does not declare', async () => {
    const t = build([
      [calls({ name: 'update', args: { id: 'not-a-uuid', isAdmin: true } })],
      [text('')],
    ]);
    const tool = t.register('update', () => 'x', { dto: AiUpdateEventDto });
    await t.run();
    expect(tool).not.toHaveBeenCalled();
  });
});

describe('AgentService write-tool confirmation', () => {
  const EVENT = '22222222-2222-4222-8222-222222222222';

  function withCalendarTool() {
    const t = build([
      [calls({ name: 'update_calendar_event', args: { id: EVENT, title: 'Mới' } })],
      [text('Tôi đề xuất đổi tiêu đề, bạn xác nhận nhé')],
    ]);
    const calendarService = { updateEvent: vi.fn().mockResolvedValue({ id: EVENT }) };
    (t.service as any).toolsMap.set('update_calendar_event', {
      definition: { name: 'update_calendar_event' },
      options: { dto: AiUpdateEventDto, requiresConfirmation: true },
      instance: new CalendarTools(calendarService as any),
      methodName: 'updateCalendarEvent',
    });
    return { ...t, calendarService };
  }

  it('never runs a requiresConfirmation tool inside the loop', async () => {
    const t = withCalendarTool();
    const frames = await t.run();

    expect(t.calendarService.updateEvent).not.toHaveBeenCalled();
    expect(t.sent(1)[0].response).toEqual({ status: 'awaiting_user_confirmation' });
    expect(frames[0]).toMatchObject({
      type: 'confirmation_required',
      tool: 'update_calendar_event',
      args: { id: EVENT, title: 'Mới' },
    });
  });

  it('confirm executes exactly once with the mapped arguments; a second confirm is 404', async () => {
    const t = withCalendarTool();
    const [{ actionId }] = await t.run();

    await t.service.confirmAction(actionId);

    expect(t.calendarService.updateEvent).toHaveBeenCalledTimes(1);
    expect(t.calendarService.updateEvent.mock.calls[0][0]).toBe(EVENT);
    expect(t.calendarService.updateEvent.mock.calls[0][1]).toEqual({ title: 'Mới' });
    await expect(t.service.confirmAction(actionId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a discarded action cannot be confirmed', async () => {
    const t = withCalendarTool();
    const [{ actionId }] = await t.run();

    t.service.discardAction(actionId);

    await expect(t.service.confirmAction(actionId)).rejects.toBeInstanceOf(NotFoundException);
    expect(t.calendarService.updateEvent).not.toHaveBeenCalled();
  });
});
