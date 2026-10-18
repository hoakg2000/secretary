import { describe, expect, it } from 'vitest';
import { bootFlow, need } from './support/flow';
import { api, chat } from './support/http';

const vnDate = (date: Date) => date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
const vnHour = (date: Date) =>
  Number(date.toLocaleTimeString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', hour12: false }));

describe('chat tools: finance, calendar, memory (real Gemini)', () => {
  const ctx = bootFlow();
  const state: { mariId?: string; accountId?: string; actionId?: string } = {};

  it('prepares Mari and a bank account to book against', async () => {
    const characters = await api('GET', '/characters', { token: ctx.token });
    state.mariId = characters.body.data.find((c: { slug?: string }) => c.slug === 'iochi_mari')?.id;
    expect(state.mariId, 'seeded character iochi_mari').toBeDefined();

    const account = await api('POST', '/finance/accounts', {
      token: ctx.token,
      body: { accountName: 'Ví tiền mặt E2E', bankCode: 'CASH', accountNumber: 'E2E-CASH-1', cachedBalance: 1_000_000, currency: 'VND' },
    });
    expect(account.status).toBe(201);
    state.accountId = account.body.data.id;
  });

  it('proposes an expense and waits for confirmation instead of writing it', async () => {
    const accountId = need(state.accountId, 'bank account id');
    const result = await chat(ctx.token, {
      message: `Ghi giúp tôi khoản chi 50.000đ ăn trưa vào tài khoản có ID ${accountId} (VND), thời gian là bây giờ.`,
      characterId: need(state.mariId, 'Mari character id'),
    });

    expect(result.status).toBe(200);
    expect(result.errors).toEqual([]);
    const confirmation = result.ofType('confirmation_required').find((f) => f.tool === 'create_financial_transaction');
    expect(confirmation, 'confirmation_required frame for create_financial_transaction').toBeDefined();
    expect(Number(confirmation?.args?.amount)).toBe(50_000);
    expect(confirmation?.args?.type).toBe('EXPENSE');
    state.actionId = confirmation?.actionId;

    // nothing is written before the user confirms
    const before = await api('POST', '/finance/transactions/search', { token: ctx.token, body: { accountId } });
    expect(before.body.data.items).toHaveLength(0);
  });

  it('writes the transaction once the action is confirmed', async () => {
    const accountId = need(state.accountId, 'bank account id');
    const confirm = await api('POST', `/ai-agent/actions/${need(state.actionId, 'action id')}/confirm`, { token: ctx.token });
    expect(confirm.status).toBe(200);

    const { body } = await api('POST', '/finance/transactions/search', { token: ctx.token, body: { accountId } });
    expect(body.data.items).toHaveLength(1);
    expect(Number(body.data.items[0].amount)).toBe(50_000);
    expect(body.data.items[0].type).toBe('EXPENSE');

    const again = await api('POST', `/ai-agent/actions/${state.actionId}/confirm`, { token: ctx.token });
    expect(again.status, 'an action runs only once').toBe(404);
  });

  it('creates a calendar event for tomorrow 15:00 through the tool', async () => {
    const result = await chat(ctx.token, {
      message: 'Tạo lịch họp nhóm lúc 3 giờ chiều ngày mai, kéo dài một tiếng.',
      characterId: need(state.mariId, 'Mari character id'),
    });

    expect(result.status).toBe(200);
    expect(result.errors).toEqual([]);
    const toolResult = result.ofType('tool_result').find((f) => f.tool === 'create_calendar_event');
    expect(toolResult, 'tool_result frame for create_calendar_event').toBeDefined();
    expect(toolResult?.result?.id).toBeTruthy();

    // tomorrow may fall in the next month
    const [year, month] = vnDate(new Date(Date.now() + 24 * 3600 * 1000)).split('-').map(Number);
    const { body } = await api('GET', `/calendar?month=${month}&year=${year}`, { token: ctx.token });
    const event = body.data.find((e: { id: string }) => e.id === toolResult?.result?.id);
    expect(event, 'event listed by GET /calendar').toBeDefined();
    const start = new Date(event.startTime);
    expect(vnDate(start)).toBe(vnDate(new Date(Date.now() + 24 * 3600 * 1000)));
    expect(vnHour(start)).toBe(15);
  });

  it('saves a preference to memory and recalls it in a new session', async () => {
    const saved = await chat(ctx.token, {
      message: 'Hãy nhớ rằng tôi thích uống cà phê sữa đá.',
      characterId: need(state.mariId, 'Mari character id'),
    });
    expect(saved.status).toBe(200);
    expect(saved.errors).toEqual([]);
    expect(saved.ofType('tool_result').some((f) => f.tool === 'save_user_memory')).toBe(true);

    const memories = await api('GET', '/ai-agent/memories', { token: ctx.token });
    expect(memories.status).toBe(200);
    const contents: string[] = memories.body.data.items.map((m: { content: string }) => m.content.normalize('NFC').toLowerCase());
    expect(contents.some((c) => c.includes('cà phê'))).toBe(true);

    const recalled = await chat(ctx.token, {
      message: 'Tôi thích uống gì nhỉ?',
      characterId: need(state.mariId, 'Mari character id'),
    });
    expect(recalled.status).toBe(200);
    expect(recalled.errors).toEqual([]);
    expect(recalled.sessionId).not.toBe(saved.sessionId);
    expect(recalled.text.normalize('NFC').toLowerCase()).toContain('cà phê');
  });
});
