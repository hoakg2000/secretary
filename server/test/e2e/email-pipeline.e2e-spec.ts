import { describe, expect, it } from 'vitest';
import { ingest, uniqueMessageId, waitForEmailDone, type EmailLogRow } from './support/email';
import { bootFlow, need } from './support/flow';
import { api } from './support/http';

const BANK_SENDER = 'Vietcombank <no-reply@vcb-e2e.test>';
const MEETING_SENDER = 'Chị Lan <lan@meet-e2e.test>';
const BLOCKED_SENDER = 'Khuyến mãi <promo@blocked-e2e.test>';
const ACCOUNT_NUMBER = '1012345678';

/** Tomorrow's date in Ho Chi Minh time as YYYY-MM-DD */
const tomorrowVn = () =>
  new Date(Date.now() + 24 * 3600 * 1000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });

describe('email pipeline flow (real Gemini)', () => {
  const ctx = bootFlow();
  const state: { accountId?: string; bank?: EmailLogRow; bankLogId?: string; bankMessageId?: string } = {};

  it('prepares a bank account and the sender rules', async () => {
    const account = await api('POST', '/finance/accounts', {
      token: ctx.token,
      body: { accountName: 'E2E Vietcombank', bankCode: 'VCB', accountNumber: ACCOUNT_NUMBER, cachedBalance: 1_000_000, currency: 'VND' },
    });
    expect(account.status).toBe(201);
    state.accountId = account.body.data.id;

    for (const rule of [
      { type: 'blacklist', matcher: 'sender', matchValue: 'blocked-e2e.test' },
      { type: 'moneylist', matcher: 'sender', matchValue: 'vcb-e2e.test' },
      { type: 'whitelist', matcher: 'sender', matchValue: 'meet-e2e.test' },
    ]) {
      const { status } = await api('POST', '/email-rules', { token: ctx.token, body: rule });
      expect(status).toBe(201);
    }
  });

  it('ingests a bank alert and the worker marks it PROCESSED with a summary', async () => {
    state.bankMessageId = uniqueMessageId('bank');
    const { status, body } = await ingest(ctx.token, {
      messageId: state.bankMessageId,
      sender: BANK_SENDER,
      subject: 'Thông báo biến động số dư tài khoản',
      rawBody: `Quý khách có giao dịch mới. Ngân hàng: VCB (Vietcombank). Số tài khoản: ${ACCOUNT_NUMBER}. Biến động số dư: +500,000 VND. Nội dung: Chuyển tiền từ NGUYEN VAN A. Thời gian: ${new Date().toISOString()}.`,
    });
    expect(status).toBe(200);
    expect(body.data?.status).toBe('PENDING');
    expect(body.data?.jobId).toBeTruthy();
    state.bankLogId = body.data?.emailLogId;

    state.bank = await waitForEmailDone(ctx.token, need(state.bankLogId, 'bank email log id'));
    expect(state.bank.status).toBe('PROCESSED');
    expect((state.bank.aiSummary ?? '').trim().length).toBeGreaterThan(0);
  });

  it('creates a 500,000 INCOME transaction linked to the bank email', async () => {
    const { status, body } = await api('POST', '/finance/transactions/search', {
      token: ctx.token,
      body: { accountId: need(state.accountId, 'bank account id') },
    });
    expect(status).toBe(200);
    const linked = body.data.items.filter((t: { emailLogId: string | null }) => t.emailLogId === state.bankLogId);
    expect(linked, 'transaction linked to the bank email').toHaveLength(1);
    expect(Number(linked[0].amount)).toBe(500_000);
    expect(linked[0].type).toBe('INCOME');
  });

  it('turns a meeting invite into a calendar event', async () => {
    const date = tomorrowVn();
    const { body } = await ingest(ctx.token, {
      messageId: uniqueMessageId('meeting'),
      sender: MEETING_SENDER,
      subject: 'Mời họp dự án Sakura',
      rawBody: `Chào bạn, mời bạn tham dự cuộc họp dự án Sakura vào ngày ${date} lúc 15:00 đến 16:00 (giờ Việt Nam, GMT+7) tại phòng họp tầng 3, văn phòng Quận 1.`,
    });
    const row = await waitForEmailDone(ctx.token, need(body.data?.emailLogId, 'meeting email log id'));
    expect(row.status).toBe('PROCESSED');

    const from = new Date().toISOString();
    const to = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const events = await api('GET', `/calendar?fromDate=${encodeURIComponent(from)}&toDate=${encodeURIComponent(to)}`, {
      token: ctx.token,
    });
    expect(events.status).toBe(200);
    expect(events.body.data.length).toBeGreaterThanOrEqual(1);
    // 15:00 Ho Chi Minh time is 08:00 UTC; tolerate the model picking a nearby hour
    const startsOnDate = events.body.data.some((e: { startTime: string }) =>
      new Date(e.startTime).toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }) === date,
    );
    expect(startsOnDate, `an event on ${date}`).toBe(true);
  });

  it('skips an email from a blacklisted sender without queuing it', async () => {
    const { status, body } = await ingest(ctx.token, {
      messageId: uniqueMessageId('blocked'),
      sender: BLOCKED_SENDER,
      subject: 'Giảm giá 90%',
      rawBody: 'Mua ngay kẻo lỡ!',
    });
    expect(status).toBe(200);
    expect(body.data?.status).toBe('SKIPPED');
    expect(body.data?.jobId).toBeNull();

    const logs = await api('GET', '/email/logs?status=SKIPPED', { token: ctx.token });
    expect(logs.body.data.items.map((l: EmailLogRow) => l.id)).toContain(body.data?.emailLogId);
  });

  it('answers data null for a duplicate messageId', async () => {
    const { status, body } = await ingest(ctx.token, {
      messageId: need(state.bankMessageId, 'bank message id'),
      sender: BANK_SENDER,
      subject: 'Thông báo biến động số dư tài khoản',
      rawBody: 'duplicate',
    });
    expect(status).toBe(200);
    expect(body.data).toBeNull();
  });
});
