import { BadRequestException, InternalServerErrorException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ChatRole } from '@prisma/client';
import { TtsService } from '../../src/ai-agent/services/tts/tts.service';
import { overrideConfig, MISSING, createTestModule, resetState, seedCharacter, seedUser, type TestContext } from './harness';

const FISH = 'api.fish.audio';

describe('tts integration (Fish.audio answers through the fetch stub)', () => {
  let ctx: TestContext;
  let tts: TtsService;

  beforeAll(async () => {
    ctx = await createTestModule();
    tts = ctx.moduleRef.get(TtsService);
  });

  afterAll(() => ctx.close());

  beforeEach(async () => {
    await resetState(ctx);
    await ctx.queue.pause();
  });

  const seedMessage = async (
    options: { voiceId?: string | null; content?: string; character?: boolean; userId?: string } = {},
  ) => {
    const { voiceId = 'voice-42', content = 'Xin chào bạn', character = true } = options;
    const user = options.userId ? { id: options.userId } : await seedUser(ctx.prisma);
    const characterRow = character ? await seedCharacter(ctx.prisma, { voiceId }) : null;
    const session = await ctx.prisma.chatSession.create({
      data: { userId: user.id, characterId: characterRow?.id },
    });
    const message = await ctx.prisma.chatMessage.create({
      data: { sessionId: session.id, role: ChatRole.MODEL, content },
    });
    return { user, message, character: characterRow };
  };

  it('calls Fish.audio with the message text, the character voice and mp3, and returns a readable stream', async () => {
    const { user, message } = await seedMessage({ voiceId: 'voice-42', content: 'Xin chào bạn' });

    const result = await tts.textToSpeech(user.id, { messageId: message.id });

    const [call] = ctx.http.callsTo(FISH);
    expect(ctx.http.callsTo(FISH)).toHaveLength(1);
    expect(call.url).toBe('https://api.fish.audio/v1/tts');
    expect(call.method).toBe('POST');
    expect(call.headers.authorization).toBe('Bearer test');
    expect(call.headers['content-type']).toBe('application/json');
    expect(call.json).toEqual({ text: 'Xin chào bạn', reference_id: 'voice-42', format: 'mp3' });
    const bytes = new Uint8Array(await new Response(result).arrayBuffer());
    expect([...bytes]).toEqual([1, 2, 3]);
  });

  describe('missing API key', () => {
    it('returns 503 before any lookup or network call, even for an unknown message', async () => {
      overrideConfig(ctx, { FISH_AUDIO_API_KEY: undefined });
      const user = await seedUser(ctx.prisma);

      await expect(tts.textToSpeech(user.id, { messageId: MISSING })).rejects.toBeInstanceOf(ServiceUnavailableException);

      expect(ctx.http.callsTo(FISH)).toHaveLength(0);
    });
  });

  describe('message lookup', () => {
    it('returns 404 for an unknown message', async () => {
      const user = await seedUser(ctx.prisma);

      await expect(tts.textToSpeech(user.id, { messageId: MISSING })).rejects.toBeInstanceOf(NotFoundException);

      expect(ctx.http.callsTo(FISH)).toHaveLength(0);
    });

    it('returns 404 for a message of another user and does not call Fish.audio', async () => {
      const { message } = await seedMessage();
      const stranger = await seedUser(ctx.prisma);

      await expect(tts.textToSpeech(stranger.id, { messageId: message.id })).rejects.toBeInstanceOf(NotFoundException);

      expect(ctx.http.callsTo(FISH)).toHaveLength(0);
    });
  });

  describe('request validation', () => {
    it('returns 400 when the character has no voice', async () => {
      const { user, message } = await seedMessage({ voiceId: null });

      await expect(tts.textToSpeech(user.id, { messageId: message.id })).rejects.toBeInstanceOf(BadRequestException);

      expect(ctx.http.callsTo(FISH)).toHaveLength(0);
    });

    it('returns 400 when the session has no character', async () => {
      const { user, message } = await seedMessage({ character: false });

      await expect(tts.textToSpeech(user.id, { messageId: message.id })).rejects.toBeInstanceOf(BadRequestException);

      expect(ctx.http.callsTo(FISH)).toHaveLength(0);
    });

    it('returns 400 when the character was deleted after the chat', async () => {
      const { user, message, character } = await seedMessage();
      await ctx.prisma.character.delete({ where: { id: character!.id } });

      await expect(tts.textToSpeech(user.id, { messageId: message.id })).rejects.toBeInstanceOf(BadRequestException);

      expect(ctx.http.callsTo(FISH)).toHaveLength(0);
    });

    it.each(['', '   ', '\n\t'])('returns 400 for blank content %j', async (content) => {
      const { user, message } = await seedMessage({ content });

      await expect(tts.textToSpeech(user.id, { messageId: message.id })).rejects.toBeInstanceOf(BadRequestException);

      expect(ctx.http.callsTo(FISH)).toHaveLength(0);
    });
  });

  describe('Fish.audio failures', () => {
    it.each([400, 401, 402, 429, 500])('maps HTTP %i to a 500 TTS_FAILED without leaking upstream details', async (status) => {
      ctx.http.respond(FISH, new Response('secret upstream detail', { status }));
      const { user, message } = await seedMessage();

      const error = await tts.textToSpeech(user.id, { messageId: message.id }).catch((e) => e);

      expect(error).toBeInstanceOf(InternalServerErrorException);
      expect(error.message).toBe('Lỗi khi gọi dịch vụ chuyển văn bản thành giọng nói');
      expect(error.message).not.toContain('secret');
    });

    it('maps a network error to a 500 TTS_FAILED', async () => {
      ctx.http.fail(FISH, new Error('ECONNRESET secret'));
      const { user, message } = await seedMessage();

      const error = await tts.textToSpeech(user.id, { messageId: message.id }).catch((e) => e);

      expect(error).toBeInstanceOf(InternalServerErrorException);
      expect(error.message).not.toContain('ECONNRESET');
    });

    it('maps a 200 answer without a body to a 500', async () => {
      ctx.http.respond(FISH, new Response(null, { status: 200 }));
      const { user, message } = await seedMessage();

      await expect(tts.textToSpeech(user.id, { messageId: message.id })).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });
});
