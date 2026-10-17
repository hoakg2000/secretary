import { Logger } from '@nestjs/common';
import { ProactiveChannel, ProactiveTriggerType } from '../../src/proactive/dto/trigger-proactive.dto';
import { ProactiveService } from '../../src/proactive/proactive.service';
import { TelegramClient } from '../../src/proactive/telegram.client';
import { createTestModule, jsonResponse, overrideConfig, resetState, seedEvent, type TestContext } from './harness';

const TELEGRAM = 'api.telegram.org';
const MIN = 60_000;

describe('proactive integration (Telegram answers through the fetch stub)', () => {
  let ctx: TestContext;
  let proactive: ProactiveService;
  let telegram: TelegramClient;

  beforeAll(async () => {
    ctx = await createTestModule();
    proactive = ctx.moduleRef.get(ProactiveService);
    telegram = ctx.moduleRef.get(TelegramClient);
  });

  afterAll(() => ctx.close());

  beforeEach(async () => {
    await resetState(ctx);
    await ctx.queue.pause();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const hhmm = (date: Date, timeZone: string) => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)!.value;
    return `${get('hour')}:${get('minute')}`;
  };

  describe('TelegramClient.sendMessage', () => {
    it('posts chat_id and text as JSON to the bot URL and returns SENT', async () => {
      const status = await telegram.sendMessage('xin chào');

      expect(status).toBe('SENT');
      const calls = ctx.http.callsTo(TELEGRAM);
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe('https://api.telegram.org/bottest/sendMessage');
      expect(calls[0].method).toBe('POST');
      expect(calls[0].headers['content-type']).toBe('application/json');
      expect(calls[0].json).toEqual({ chat_id: 'test', text: 'xin chào' });
    });

    it('uses the configured bot token and chat id', async () => {
      overrideConfig(ctx, { TELEGRAM_BOT_TOKEN: 'tok-123', TELEGRAM_CHAT_ID: '987' });

      await telegram.sendMessage('hi');

      const [call] = ctx.http.callsTo(TELEGRAM);
      expect(call.url).toBe('https://api.telegram.org/bottok-123/sendMessage');
      expect(call.json).toEqual({ chat_id: '987', text: 'hi' });
    });

    it('returns FAILED when Telegram answers 500', async () => {
      ctx.http.respond(TELEGRAM, jsonResponse({ ok: false, description: 'boom' }, 500));

      expect(await telegram.sendMessage('hi')).toBe('FAILED');
      expect(ctx.http.callsTo(TELEGRAM)).toHaveLength(1);
    });

    it('returns FAILED when Telegram rejects the request with 400', async () => {
      ctx.http.respond(TELEGRAM, jsonResponse({ ok: false, description: 'chat not found' }, 400));

      expect(await telegram.sendMessage('hi')).toBe('FAILED');
    });

    it('returns FAILED on a network error', async () => {
      ctx.http.fail(TELEGRAM);

      expect(await telegram.sendMessage('hi')).toBe('FAILED');
    });

    it('does not leak the bot token through the thrown error (returns a status, never throws)', async () => {
      const logged = [vi.spyOn(Logger.prototype, 'error'), vi.spyOn(Logger.prototype, 'warn')];
      ctx.http.fail(TELEGRAM, new Error('connect ECONNREFUSED https://api.telegram.org/bottest/sendMessage'));

      await expect(telegram.sendMessage('hi')).resolves.toBe('FAILED');

      const calls = logged.flatMap((spy) => spy.mock.calls);
      expect(calls.length).toBeGreaterThan(0);
      for (const arg of calls.flat()) {
        expect(arg instanceof Error ? `${arg.message}
${arg.stack}` : String(arg)).not.toContain('bottest');
      }
    });

    it.each([
      ['bot token', { TELEGRAM_BOT_TOKEN: undefined }],
      ['chat id', { TELEGRAM_CHAT_ID: undefined }],
      ['empty bot token', { TELEGRAM_BOT_TOKEN: '' }],
    ])('returns NOT_CONFIGURED without calling Telegram when the %s is missing', async (_name, values) => {
      overrideConfig(ctx, values);

      expect(await telegram.sendMessage('hi')).toBe('NOT_CONFIGURED');
      expect(ctx.http.callsTo(TELEGRAM)).toHaveLength(0);
    });
  });

  describe('ProactiveService.evaluateAndTrigger', () => {
    it.each(Object.values(ProactiveTriggerType))(
      'sends a %s message to Telegram and reports success',
      async (type) => {
        const result = await proactive.evaluateAndTrigger({
          type,
          message: `message for ${type}`,
          channel: ProactiveChannel.TELEGRAM,
        });

        expect(result.success).toBe(true);
        expect(result.channel).toBe('TELEGRAM');
        expect(result.result.status).toBe('SENT');
        expect(result.payload.type).toBe(type);
        const calls = ctx.http.callsTo(TELEGRAM);
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe('https://api.telegram.org/bottest/sendMessage');
        expect(calls[0].json).toEqual({ chat_id: 'test', text: `message for ${type}` });
      },
    );

    it('defaults the channel to TELEGRAM and the metadata to {} when omitted', async () => {
      const result = await proactive.evaluateAndTrigger({
        type: ProactiveTriggerType.CUSTOM,
        message: 'x',
      });

      expect(result.channel).toBe('TELEGRAM');
      expect(result.payload.metadata).toEqual({});
      expect(Number.isNaN(Date.parse(result.payload.timestamp))).toBe(false);
      expect(Number.isNaN(Date.parse(result.result.at))).toBe(false);
    });

    it('keeps the metadata in the payload but does not send it to Telegram', async () => {
      const result = await proactive.evaluateAndTrigger({
        type: ProactiveTriggerType.URGENT_EVENT,
        message: 'urgent',
        metadata: { eventId: 'e1', priority: 'HIGH' },
      });

      expect(result.payload.metadata).toEqual({ eventId: 'e1', priority: 'HIGH' });
      expect(ctx.http.callsTo(TELEGRAM)[0].json).toEqual({ chat_id: 'test', text: 'urgent' });
    });

    it('returns FAILED and success=false when Telegram answers 500', async () => {
      ctx.http.respond(TELEGRAM, jsonResponse({ ok: false }, 500));

      const result = await proactive.evaluateAndTrigger({ type: ProactiveTriggerType.CUSTOM, message: 'x' });

      expect(result.success).toBe(false);
      expect(result.result.status).toBe('FAILED');
    });

    it('returns FAILED and success=false on a network error', async () => {
      ctx.http.fail(TELEGRAM);

      const result = await proactive.evaluateAndTrigger({ type: ProactiveTriggerType.CUSTOM, message: 'x' });

      expect(result.success).toBe(false);
      expect(result.result.status).toBe('FAILED');
    });

    it.each([
      ['TELEGRAM_BOT_TOKEN', { TELEGRAM_BOT_TOKEN: undefined }],
      ['TELEGRAM_CHAT_ID', { TELEGRAM_CHAT_ID: undefined }],
    ])('returns NOT_CONFIGURED without any fetch when %s is missing', async (_name, values) => {
      overrideConfig(ctx, values);

      const result = await proactive.evaluateAndTrigger({ type: ProactiveTriggerType.CUSTOM, message: 'x' });

      expect(result.success).toBe(false);
      expect(result.result.status).toBe('NOT_CONFIGURED');
      expect(ctx.http.calls).toHaveLength(0);
    });

    it('writes nothing to the database', async () => {
      await proactive.evaluateAndTrigger({ type: ProactiveTriggerType.CUSTOM, message: 'x' });

      expect(await ctx.prisma.localCalendar.count()).toBe(0);
      expect(await ctx.prisma.user.count()).toBe(0);
    });
  });

  describe('ProactiveService.handleFallbackCron', () => {
    it('sends one reminder per event starting within 15 minutes and sets reminded_at', async () => {
      const now = Date.now();
      const a = await seedEvent(ctx.prisma, { title: 'Họp A', startTime: new Date(now + 5 * MIN), endTime: new Date(now + 65 * MIN) });
      const b = await seedEvent(ctx.prisma, { title: 'Họp B', startTime: new Date(now + 12 * MIN), endTime: new Date(now + 72 * MIN) });

      await proactive.handleFallbackCron();

      const calls = ctx.http.callsTo(TELEGRAM);
      expect(calls).toHaveLength(2);
      const texts = calls.map((c) => c.json.text as string);
      expect(texts.filter((t) => t.includes('"Họp A"'))).toHaveLength(1);
      expect(texts.filter((t) => t.includes('"Họp B"'))).toHaveLength(1);
      for (const t of texts) expect(t.startsWith('Nhắc nhở lịch trình: Sắp tới cuộc hẹn "')).toBe(true);
      for (const id of [a.id, b.id]) {
        const row = await ctx.prisma.localCalendar.findUniqueOrThrow({ where: { id } });
        expect(row.remindedAt).toBeInstanceOf(Date);
        expect(Math.abs(row.remindedAt!.getTime() - Date.now())).toBeLessThan(60_000);
      }
    });

    it('skips events outside the window (past and more than 15 minutes ahead)', async () => {
      const now = Date.now();
      const past = await seedEvent(ctx.prisma, { title: 'Past', startTime: new Date(now - 2 * MIN), endTime: new Date(now + 30 * MIN) });
      const far = await seedEvent(ctx.prisma, { title: 'Far', startTime: new Date(now + 30 * MIN), endTime: new Date(now + 90 * MIN) });

      await proactive.handleFallbackCron();

      expect(ctx.http.calls).toHaveLength(0);
      for (const id of [past.id, far.id]) {
        const row = await ctx.prisma.localCalendar.findUniqueOrThrow({ where: { id } });
        expect(row.remindedAt).toBeNull();
      }
    });

    it('skips events that were already reminded and keeps their reminded_at', async () => {
      const now = Date.now();
      const reminded = new Date(now - 5 * MIN);
      const event = await seedEvent(ctx.prisma, {
        title: 'Done',
        startTime: new Date(now + 5 * MIN),
        endTime: new Date(now + 65 * MIN),
        remindedAt: reminded,
      });

      await proactive.handleFallbackCron();

      expect(ctx.http.calls).toHaveLength(0);
      const row = await ctx.prisma.localCalendar.findUniqueOrThrow({ where: { id: event.id } });
      expect(row.remindedAt?.getTime()).toBe(reminded.getTime());
    });

    it('skips soft-deleted events', async () => {
      const now = Date.now();
      const event = await seedEvent(ctx.prisma, {
        title: 'Deleted',
        startTime: new Date(now + 5 * MIN),
        endTime: new Date(now + 65 * MIN),
        deletedAt: new Date(),
      });

      await proactive.handleFallbackCron();

      expect(ctx.http.calls).toHaveLength(0);
      const row = await ctx.prisma.localCalendar.findUniqueOrThrow({ where: { id: event.id } });
      expect(row.remindedAt).toBeNull();
    });

    it('does nothing when there are no events', async () => {
      await proactive.handleFallbackCron();

      expect(ctx.http.calls).toHaveLength(0);
    });

    it('formats the start time in APP_TIMEZONE', async () => {
      const start = new Date(Date.now() + 10 * MIN);
      await seedEvent(ctx.prisma, { title: 'Zone', startTime: start, endTime: new Date(start.getTime() + 60 * MIN) });

      await proactive.handleFallbackCron();
      const hcm = ctx.http.callsTo(TELEGRAM)[0].json.text as string;
      expect(hcm).toContain(`lúc ${hhmm(start, 'Asia/Ho_Chi_Minh')}:`);

      // same event in another zone: reset reminded_at, switch the zone
      await ctx.prisma.localCalendar.updateMany({ data: { remindedAt: null } });
      ctx.http.reset();
      overrideConfig(ctx, { APP_TIMEZONE: 'America/New_York' });
      await proactive.handleFallbackCron();
      const ny = ctx.http.callsTo(TELEGRAM)[0].json.text as string;
      expect(ny).toContain(`lúc ${hhmm(start, 'America/New_York')}:`);
      expect(ny).not.toBe(hcm);
    });

    it('leaves reminded_at null when Telegram answers 500, then retries on the next run', async () => {
      const now = Date.now();
      const event = await seedEvent(ctx.prisma, { title: 'Retry', startTime: new Date(now + 5 * MIN), endTime: new Date(now + 65 * MIN) });
      ctx.http.respond(TELEGRAM, jsonResponse({ ok: false }, 500));

      await proactive.handleFallbackCron();

      expect(ctx.http.callsTo(TELEGRAM)).toHaveLength(1);
      expect((await ctx.prisma.localCalendar.findUniqueOrThrow({ where: { id: event.id } })).remindedAt).toBeNull();

      ctx.http.respond(TELEGRAM, jsonResponse({ ok: true }));
      await proactive.handleFallbackCron();

      expect(ctx.http.callsTo(TELEGRAM)).toHaveLength(2);
      expect((await ctx.prisma.localCalendar.findUniqueOrThrow({ where: { id: event.id } })).remindedAt).toBeInstanceOf(Date);
    });

    it('leaves reminded_at null on a network error', async () => {
      const event = await seedEvent(ctx.prisma, {
        title: 'Net',
        startTime: new Date(Date.now() + 5 * MIN),
        endTime: new Date(Date.now() + 65 * MIN),
      });
      ctx.http.fail(TELEGRAM);

      await proactive.handleFallbackCron();

      expect((await ctx.prisma.localCalendar.findUniqueOrThrow({ where: { id: event.id } })).remindedAt).toBeNull();
    });

    it('leaves reminded_at null when Telegram is not configured', async () => {
      const event = await seedEvent(ctx.prisma, {
        title: 'NoCfg',
        startTime: new Date(Date.now() + 5 * MIN),
        endTime: new Date(Date.now() + 65 * MIN),
      });
      overrideConfig(ctx, { TELEGRAM_CHAT_ID: undefined });

      await proactive.handleFallbackCron();

      expect(ctx.http.calls).toHaveLength(0);
      expect((await ctx.prisma.localCalendar.findUniqueOrThrow({ where: { id: event.id } })).remindedAt).toBeNull();
    });

    it('keeps going after one failed send: the next event is still reminded', async () => {
      const now = Date.now();
      const first = await seedEvent(ctx.prisma, { title: 'First', startTime: new Date(now + 3 * MIN), endTime: new Date(now + 60 * MIN) });
      const second = await seedEvent(ctx.prisma, { title: 'Second', startTime: new Date(now + 8 * MIN), endTime: new Date(now + 60 * MIN) });
      ctx.http.respond(TELEGRAM, (call) =>
        call.json.text.includes('"First"') ? jsonResponse({ ok: false }, 500) : jsonResponse({ ok: true }));

      await proactive.handleFallbackCron();

      expect(ctx.http.callsTo(TELEGRAM)).toHaveLength(2);
      expect((await ctx.prisma.localCalendar.findUniqueOrThrow({ where: { id: first.id } })).remindedAt).toBeNull();
      expect((await ctx.prisma.localCalendar.findUniqueOrThrow({ where: { id: second.id } })).remindedAt).toBeInstanceOf(Date);
    });

    it('sends once when called twice', async () => {
      await seedEvent(ctx.prisma, {
        title: 'Once',
        startTime: new Date(Date.now() + 5 * MIN),
        endTime: new Date(Date.now() + 65 * MIN),
      });

      await proactive.handleFallbackCron();
      await proactive.handleFallbackCron();

      expect(ctx.http.callsTo(TELEGRAM)).toHaveLength(1);
    });
  });

  describe('ProactiveService.aiSendProactiveNotification', () => {
    it('sends the message through Telegram and returns the evaluateAndTrigger result', async () => {
      const result = await proactive.aiSendProactiveNotification({
        type: ProactiveTriggerType.URGENT_EVENT,
        message: 'từ trợ lý',
        channel: ProactiveChannel.TELEGRAM,
      });

      expect(result.success).toBe(true);
      expect(result.result.status).toBe('SENT');
      expect(result.payload.type).toBe('URGENT_EVENT');
      const calls = ctx.http.callsTo(TELEGRAM);
      expect(calls).toHaveLength(1);
      expect(calls[0].json).toEqual({ chat_id: 'test', text: 'từ trợ lý' });
    });

    it('reports success=false when Telegram fails', async () => {
      ctx.http.respond(TELEGRAM, jsonResponse({ ok: false }, 500));

      const result = await proactive.aiSendProactiveNotification({ type: ProactiveTriggerType.CUSTOM, message: 'x' });

      expect(result.success).toBe(false);
      expect(result.result.status).toBe('FAILED');
    });
  });
});
