import { TtsService } from '../../src/ai-agent/services/tts/tts.service';
import { ProactiveService } from '../../src/proactive/proactive.service';
import { createTestModule, resetDb, TestContext } from './harness';

const MINUTE_MS = 60 * 1000;

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestModule();
});
beforeEach(async () => {
  await resetDb(ctx.prisma);
  ctx.telegram.sendMessage.mockClear();
});
afterAll(() => ctx.moduleRef.close());

describe('ProactiveService.handleFallbackCron (integration)', () => {
  let proactive: ProactiveService;

  beforeAll(() => {
    proactive = ctx.moduleRef.get(ProactiveService);
  });

  const seedEvent = (title: string, startsInMinutes: number, overrides: object = {}) => {
    const startTime = new Date(Date.now() + startsInMinutes * MINUTE_MS);
    return ctx.prisma.localCalendar.create({
      data: { title, startTime, endTime: new Date(startTime.getTime() + 60 * MINUTE_MS), ...overrides },
    });
  };
  const remindedAt = async (id: string) =>
    (await ctx.prisma.localCalendar.findUniqueOrThrow({ where: { id } })).remindedAt;

  it('reminds an event starting in 10 minutes exactly once', async () => {
    const event = await seedEvent('Standup', 10);

    await proactive.handleFallbackCron();

    expect(ctx.telegram.sendMessage).toHaveBeenCalledTimes(1);
    expect(ctx.telegram.sendMessage.mock.calls[0][0]).toContain('Standup');
    expect(await remindedAt(event.id)).not.toBeNull();

    await proactive.handleFallbackCron();
    expect(ctx.telegram.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('skips an event in 20 minutes, a started event and a soft-deleted event', async () => {
    const events = [
      await seedEvent('Later', 20),
      await seedEvent('Started', -1),
      await seedEvent('Deleted', 10, { deletedAt: new Date() }),
    ];

    await proactive.handleFallbackCron();

    expect(ctx.telegram.sendMessage).not.toHaveBeenCalled();
    for (const event of events) {
      expect(await remindedAt(event.id)).toBeNull();
    }
  });

  it('a failed send leaves remindedAt empty so the next run retries', async () => {
    const event = await seedEvent('Standup', 10);
    ctx.telegram.sendMessage.mockResolvedValueOnce('FAILED');

    await proactive.handleFallbackCron();
    expect(await remindedAt(event.id)).toBeNull();

    await proactive.handleFallbackCron();
    expect(ctx.telegram.sendMessage).toHaveBeenCalledTimes(2);
    expect(await remindedAt(event.id)).not.toBeNull();
  });
});

describe('TtsService.textToSpeech (integration)', () => {
  const guard = globalThis.fetch;
  const fishAudio = vi.fn(async (_url: string, _init: any) => new Response('mp3'));

  beforeEach(() => {
    fishAudio.mockClear();
    vi.stubGlobal('fetch', fishAudio);
  });
  afterEach(() => {
    vi.stubGlobal('fetch', guard);
  });

  const requestedVoice = () => JSON.parse(fishAudio.mock.calls[0][1].body).reference_id;

  it('uses the voice of the active character when no voiceId is given', async () => {
    await ctx.prisma.character.create({ data: { name: 'Quiet', voiceId: 'other-voice' } });
    await ctx.prisma.character.create({ data: { name: 'Mari', voiceId: 'mari-voice', isActive: true } });

    await ctx.moduleRef.get(TtsService).textToSpeech({ text: 'hello' });

    expect(fishAudio.mock.calls[0][0]).toBe('https://api.fish.audio/v1/tts');
    expect(requestedVoice()).toBe('mari-voice');
  });

  it('falls back to the default voice from config without an active character', async () => {
    await ctx.prisma.character.create({ data: { name: 'Quiet', voiceId: 'other-voice' } });

    await ctx.moduleRef.get(TtsService).textToSpeech({ text: 'hello' });

    expect(requestedVoice()).toBe('default-voice');
  });
});
