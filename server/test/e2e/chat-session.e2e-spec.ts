import { describe, expect, it } from 'vitest';
import { bootFlow, need } from './support/flow';
import { api, chat } from './support/http';

// Japanese script: hiragana, katakana or kanji
const JAPANESE = /[぀-ヿ一-鿿]/;
const NAME = 'Hùng';

describe('chat session flow (real Gemini)', () => {
  const ctx = bootFlow();
  const state: { mariId?: string; customId?: string; sessionId?: string } = {};

  it('lists the seeded Mari character', async () => {
    const { status, body } = await api('GET', '/characters', { token: ctx.token });
    expect(status).toBe(200);
    const mari = body.data.find((c: { slug?: string }) => c.slug === 'iochi_mari');
    expect(mari, 'seeded character iochi_mari').toBeDefined();
    state.mariId = mari.id;
  });

  it('creates a custom character with a system prompt', async () => {
    const { status, body } = await api('POST', '/characters', {
      token: ctx.token,
      body: { name: 'E2E Assistant', systemPrompt: 'Bạn là trợ lý thử nghiệm, trả lời ngắn gọn và lịch sự.' },
    });
    expect(status).toBe(201);
    expect(body.data.systemPrompt).toContain('trợ lý thử nghiệm');
    state.customId = body.data.id;
  });

  it('streams session, text, reply and done frames for a new session with Mari', async () => {
    const result = await chat(ctx.token, {
      message: `Xin chào, tôi tên là ${NAME} và tôi đang học tiếng Nhật.`,
      characterId: need(state.mariId, 'Mari character id'),
    });

    expect(result.status).toBe(200);
    expect(result.errors).toEqual([]);
    expect(result.frames[0].type).toBe('session');
    expect(result.frames.at(-1)?.type).toBe('done');
    expect(result.ofType('text').length).toBeGreaterThanOrEqual(1);
    expect(result.text.trim().length).toBeGreaterThan(0);
    expect(result.reply, 'reply frame').toBeDefined();
    expect(String(result.reply?.contentJp)).toMatch(JAPANESE);
    // reply comes after every text frame and right before done
    expect(result.frames.map((f) => f.type).slice(-2)).toEqual(['reply', 'done']);
    state.sessionId = result.sessionId;
  });

  it('lists the new session', async () => {
    const { status, body } = await api('GET', '/ai-agent/sessions', { token: ctx.token });
    expect(status).toBe(200);
    const ids = body.data.items.map((s: { id: string }) => s.id);
    expect(ids).toContain(need(state.sessionId, 'session id'));
  });

  it('stores a USER and a MODEL message, the MODEL one with Japanese text', async () => {
    const { status, body } = await api('GET', `/ai-agent/sessions/${need(state.sessionId, 'session id')}/messages`, {
      token: ctx.token,
    });
    expect(status).toBe(200);
    const items: { role: string; content: string; contentJp: string | null }[] = body.data.items;
    expect(items.map((m) => m.role)).toEqual(['USER', 'MODEL']);
    expect(items[0].content).toContain(NAME);
    expect(items[1].content.trim().length).toBeGreaterThan(0);
    expect(items[1].contentJp ?? '').toMatch(JAPANESE);
  });

  it('answers a follow-up in the same session using the first message', async () => {
    const result = await chat(ctx.token, {
      message: 'Tôi vừa nói tên tôi là gì? Chỉ cần nhắc lại tên.',
      sessionId: need(state.sessionId, 'session id'),
    });

    expect(result.status).toBe(200);
    expect(result.errors).toEqual([]);
    expect(result.sessionId).toBe(state.sessionId);
    expect(result.frames.at(-1)?.type).toBe('done');
    expect(result.text.normalize('NFC')).toContain(NAME);
  });

  it('starts a new session with the custom character', async () => {
    const result = await chat(ctx.token, {
      message: 'Xin chào, bạn là ai?',
      characterId: need(state.customId, 'custom character id'),
    });

    expect(result.status).toBe(200);
    expect(result.errors).toEqual([]);
    expect(result.sessionId).toBeDefined();
    expect(result.sessionId).not.toBe(state.sessionId);
    expect(result.text.trim().length).toBeGreaterThan(0);
    expect(result.frames.map((f) => f.type).slice(-2)).toEqual(['reply', 'done']);
  });
});
