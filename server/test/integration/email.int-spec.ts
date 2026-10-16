import { BadRequestException, NotFoundException } from '@nestjs/common';
import { google } from 'googleapis';
import { randomUUID } from 'node:crypto';
import { GoogleClientFactory } from '../../src/auth/google-client.factory';
import { EmailRuleService } from '../../src/email/email-rule.service';
import { EmailProcessor } from '../../src/email/email.processor';
import { EmailService } from '../../src/email/email.service';
import { GmailPushService } from '../../src/email/gmail-push.service';
import { FinanceService } from '../../src/finance/finance.service';
import { createTestModule, httpError, resetDb, seedAccount, seedUser, TestContext } from './harness';

let ctx: TestContext;
let rules: EmailRuleService;
let emails: EmailService;

beforeAll(async () => {
  ctx = await createTestModule();
  rules = ctx.moduleRef.get(EmailRuleService);
  emails = ctx.moduleRef.get(EmailService);
});
beforeEach(async () => {
  await resetDb(ctx.prisma);
  ctx.queue.add.mockClear();
  ctx.telegram.sendMessage.mockClear();
  ctx.genAi.generateContent.mockReset();
});
afterAll(() => ctx.moduleRef.close());

const mail = (overrides: any = {}) => ({
  messageId: `<${randomUUID()}@mail>`,
  sender: 'Bank <no-reply@bank.vn>',
  subject: 'Balance change',
  rawBody: 'Your account received 150,000 VND',
  ...overrides,
});

describe('EmailRuleService (integration)', () => {
  it('CRUD round trip', async () => {
    const created = await rules.create({ type: 'moneylist', matcher: 'sender', matchValue: 'bank.vn' });
    expect(await rules.findOne(created.id)).toMatchObject({ matchValue: 'bank.vn', isActive: true });

    await rules.update(created.id, { matchValue: 'bank.com', isActive: false });
    expect(await rules.findAll()).toMatchObject([{ id: created.id, matchValue: 'bank.com', isActive: false }]);

    await rules.remove(created.id);
    expect(await ctx.prisma.emailRule.count()).toBe(0);
    await expect(rules.findOne(created.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an invalid or over-long regex on create and on an update that only changes the matcher', async () => {
    const regex = { type: 'whitelist' as const, matcher: 'regex' as const };
    await expect(rules.create({ ...regex, matchValue: '(' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(rules.create({ ...regex, matchValue: 'a'.repeat(201) })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(await ctx.prisma.emailRule.count()).toBe(0);

    const keyword = await rules.create({ type: 'whitelist', matcher: 'keyword', matchValue: '(' });
    await expect(rules.update(keyword.id, { matcher: 'regex' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(await rules.findOne(keyword.id)).toMatchObject({ matcher: 'keyword' });
  });

  it('classify: blacklist beats moneylist beats whitelist, inactive rules are ignored', async () => {
    const email = { sender: 'Bank <no-reply@bank.vn>', subject: 'Balance CHANGE', rawBody: 'ref TX-4242' };
    expect(await rules.classify(email)).toBeNull();

    await rules.create({ type: 'whitelist', matcher: 'sender', matchValue: 'BANK.VN' });
    expect(await rules.classify(email)).toBe('whitelist');
    expect(await rules.classify({ sender: 'someone@else.com' })).toBeNull();

    await rules.create({ type: 'moneylist', matcher: 'keyword', matchValue: 'balance change' });
    expect(await rules.classify(email)).toBe('moneylist');

    const blacklist = await rules.create({ type: 'blacklist', matcher: 'regex', matchValue: 'tx-\\d{4}' });
    expect(await rules.classify(email)).toBe('blacklist');

    await rules.update(blacklist.id, { isActive: false });
    expect(await rules.classify(email)).toBe('moneylist');
  });
});

describe('EmailService (integration)', () => {
  it('ingest stores a PENDING log and enqueues it with the log ID as job ID and a priority by rule', async () => {
    await rules.create({ type: 'moneylist', matcher: 'sender', matchValue: 'bank.vn' });
    await rules.create({ type: 'whitelist', matcher: 'sender', matchValue: 'boss@' });

    for (const [sender, priority] of [
      ['no-reply@bank.vn', 1],
      ['boss@work.com', 2],
      ['news@shop.com', 3],
    ] as const) {
      const input = mail({ sender });
      const result = await emails.ingest(input);

      const log = await ctx.prisma.emailLog.findUniqueOrThrow({ where: { messageId: input.messageId } });
      expect(log).toMatchObject({ status: 'PENDING', sender, rawBody: input.rawBody });
      expect(result).toMatchObject({ emailLogId: log.id, jobId: log.id, status: 'PENDING' });
      expect(ctx.queue.add).toHaveBeenLastCalledWith(
        'process-email-job',
        expect.objectContaining({ emailLogId: log.id, messageId: input.messageId }),
        expect.objectContaining({ jobId: log.id, priority }),
      );
    }
  });

  it('a blacklisted mail is SKIPPED and never enqueued', async () => {
    await rules.create({ type: 'blacklist', matcher: 'sender', matchValue: 'spam' });
    const input = mail({ sender: 'spam@ads.com' });

    await emails.ingest(input);

    expect(await ctx.prisma.emailLog.findMany()).toMatchObject([{ status: 'SKIPPED' }]);
    expect(ctx.queue.add).not.toHaveBeenCalled();
  });

  it('a duplicate is re-enqueued while PENDING and ignored once PROCESSED', async () => {
    const input = mail();
    const first = await emails.ingest(input);

    await expect(emails.ingest(input)).resolves.toMatchObject({ jobId: first?.emailLogId });
    expect(await ctx.prisma.emailLog.count()).toBe(1);
    expect(ctx.queue.add.mock.calls.map((call) => call[2].jobId)).toEqual([
      first?.emailLogId,
      first?.emailLogId,
    ]);

    await ctx.prisma.emailLog.update({ where: { id: first!.emailLogId }, data: { status: 'PROCESSED' } });
    await expect(emails.ingest(input)).resolves.toBeNull();
    expect(ctx.queue.add).toHaveBeenCalledTimes(2);
  });

  it('two concurrent ingests of the same message leave one row', async () => {
    const input = mail();

    await Promise.allSettled([emails.ingest(input), emails.ingest(input)]);

    expect(await ctx.prisma.emailLog.count()).toBe(1);
  });
});

describe('EmailProcessor (integration)', () => {
  let processor: EmailProcessor;

  beforeAll(() => {
    processor = ctx.moduleRef.get(EmailProcessor);
  });

  const classifyAs = (classification: object) =>
    ctx.genAi.generateContent.mockResolvedValue({
      text: JSON.stringify({ urgent: false, summary: 'summary', ...classification }),
    });

  const seedJob = async (attemptsMade = 0) => {
    const input = mail();
    const log = await ctx.prisma.emailLog.create({ data: input });
    const job: any = {
      id: log.id,
      data: { emailLogId: log.id, ...input, ruleType: null },
      attemptsMade,
      opts: { attempts: 3 },
    };
    return { log, job };
  };

  const logOf = (id: string) => ctx.prisma.emailLog.findUniqueOrThrow({ where: { id } });
  const balanceOf = async (id: string) =>
    (await ctx.prisma.bankAccount.findUniqueOrThrow({ where: { id } })).cachedBalance.toFixed(2);
  const income = (overrides: object = {}) => ({
    category: 'TRANSACTION',
    transaction: { amount: 150000, direction: 'INCOME', currency: 'vnd', bankCode: 'vcb', ...overrides },
  });

  it('TRANSACTION with one matching account creates a linked transaction and moves the balance', async () => {
    const account = await seedAccount(ctx.prisma);
    await seedAccount(ctx.prisma, { isActive: false });
    const { log, job } = await seedJob();
    classifyAs({ ...income({ counterparty: 'ACME' }), summary: 'Received 150000 from ACME' });

    await processor.process(job);

    expect(await ctx.prisma.transaction.findMany()).toMatchObject([
      { accountId: account.id, emailLogId: log.id, type: 'INCOME', counterparty: 'ACME' },
    ]);
    expect(await balanceOf(account.id)).toBe('1150000.00');
    expect(await logOf(log.id)).toMatchObject({
      status: 'PROCESSED',
      aiSummary: 'Received 150000 from ACME',
    });
  });

  it('TRANSACTION without exactly one valid match only stores the summary', async () => {
    const account = await seedAccount(ctx.prisma);

    for (const transaction of [
      { bankCode: 'TCB' },
      { currency: 'USD' },
      { amount: -5 },
      { bankCode: undefined },
    ]) {
      const { log, job } = await seedJob();
      classifyAs(income(transaction));
      await processor.process(job);
      expect(await logOf(log.id)).toMatchObject({ status: 'PROCESSED', aiSummary: 'summary' });
    }

    // Two active accounts match the same bank code
    await seedAccount(ctx.prisma, { accountNumber: '999' });
    const { log, job } = await seedJob();
    classifyAs(income());
    await processor.process(job);
    expect(await logOf(log.id)).toMatchObject({ status: 'PROCESSED' });

    expect(await ctx.prisma.transaction.count()).toBe(0);
    expect(await balanceOf(account.id)).toBe('1000000.00');
  });

  it('process run twice for the same log creates one transaction', async () => {
    const account = await seedAccount(ctx.prisma);
    const { job } = await seedJob();
    classifyAs(income());

    await processor.process(job);
    await processor.process(job);

    expect(await ctx.prisma.transaction.count()).toBe(1);
    expect(await balanceOf(account.id)).toBe('1150000.00');
  });

  it('a retry after a crash between the transaction and the status update does not double the balance', async () => {
    const account = await seedAccount(ctx.prisma);
    const { log, job } = await seedJob();
    await ctx.moduleRef.get(FinanceService).createTransaction({
      accountId: account.id,
      amount: 150000,
      type: 'INCOME',
      transactionTime: new Date(),
      emailLogId: log.id,
    });
    classifyAs(income());

    await processor.process(job);

    expect(await ctx.prisma.transaction.count()).toBe(1);
    expect(await balanceOf(account.id)).toBe('1150000.00');
    expect(await logOf(log.id)).toMatchObject({ status: 'PROCESSED' });
  });

  it('EVENT creates a DIRTY calendar event with a default one-hour end', async () => {
    const valid = await seedJob();
    classifyAs({ category: 'EVENT', event: { title: 'Review', start: '2026-10-20T09:00:00+07:00' } });
    await processor.process(valid.job);

    const invalid = await seedJob();
    classifyAs({
      category: 'EVENT',
      event: { title: 'Broken', start: '2026-10-20T09:00:00+07:00', end: '2026-10-20T08:00:00+07:00' },
    });
    await processor.process(invalid.job);

    expect(await ctx.prisma.localCalendar.findMany({ include: { syncState: true } })).toMatchObject([
      {
        title: 'Review',
        description: 'summary',
        startTime: new Date('2026-10-20T02:00:00Z'),
        endTime: new Date('2026-10-20T03:00:00Z'),
        syncState: { syncStatus: 'DIRTY' },
      },
    ]);
    expect(await logOf(valid.log.id)).toMatchObject({ status: 'PROCESSED' });
    expect(await logOf(invalid.log.id)).toMatchObject({ status: 'PROCESSED' });
  });

  it('an urgent mail is sent to Telegram once; a failed send still leaves the log PROCESSED', async () => {
    const sent = await seedJob();
    classifyAs({ category: 'OTHER', urgent: true, summary: 'Answer today' });
    await processor.process(sent.job);

    expect(ctx.telegram.sendMessage).toHaveBeenCalledTimes(1);
    expect(ctx.telegram.sendMessage.mock.calls[0][0]).toContain('Answer today');

    const failed = await seedJob();
    ctx.telegram.sendMessage.mockResolvedValueOnce('FAILED');
    await processor.process(failed.job);

    expect(ctx.telegram.sendMessage).toHaveBeenCalledTimes(2);
    expect(await logOf(sent.log.id)).toMatchObject({ status: 'PROCESSED' });
    expect(await logOf(failed.log.id)).toMatchObject({ status: 'PROCESSED', aiSummary: 'Answer today' });
  });

  it('invalid model output leaves the log PENDING; only the last failed attempt marks it FAILED', async () => {
    const { log, job } = await seedJob(1);
    ctx.genAi.generateContent.mockResolvedValue({ text: 'not json' });

    await expect(processor.process(job)).rejects.toThrow();
    expect(await logOf(log.id)).toMatchObject({ status: 'PENDING' });

    await processor.onFailed(job, new Error('bad output'));
    expect(await logOf(log.id)).toMatchObject({ status: 'PENDING' });

    await processor.onFailed({ ...job, attemptsMade: 3 }, new Error('bad output'));
    expect(await logOf(log.id)).toMatchObject({ status: 'FAILED' });
  });
});

describe('GmailPushService (integration)', () => {
  let push: GmailPushService;
  let users: any;

  const b64 = (value: string) => Buffer.from(value).toString('base64url');
  const gmailMessage = (id: string) => ({
    data: {
      id,
      payload: {
        headers: [
          { name: 'Message-Id', value: `<${id}@mail>` },
          { name: 'From', value: 'Bank <no-reply@bank.vn>' },
          { name: 'Subject', value: 'Balance change' },
        ],
        mimeType: 'multipart/alternative',
        parts: [{ mimeType: 'text/plain', body: { data: b64(`body of ${id}`) } }],
      },
    },
  });

  beforeAll(() => {
    push = ctx.moduleRef.get(GmailPushService);
  });
  beforeEach(() => {
    users = {
      watch: vi.fn(async () => ({ data: { historyId: '90' } })),
      getProfile: vi.fn(async () => ({ data: { historyId: '300' } })),
      history: {
        list: vi.fn(async (_params: any) => ({
          data: {
            history: [{ messagesAdded: [{ message: { id: 'm1' } }, { message: { id: 'm2' } }] }],
            historyId: '200',
          },
        })),
      },
      messages: {
        list: vi.fn(async (_params: any) => ({ data: { messages: [{ id: 'm3' }] } })),
        get: vi.fn(async ({ id }: any) => gmailMessage(id)),
      },
    };
    vi.spyOn(google, 'gmail').mockReturnValue({ users } as never);
  });

  const connectGoogle = async (gmailHistoryId: string | null) => {
    const user = await seedUser(ctx.prisma, { gmailHistoryId });
    await ctx.moduleRef.get(GoogleClientFactory).saveTokens(user.id, {
      access_token: 'access',
      refresh_token: 'refresh',
      expiry_date: Date.now() + 3600 * 1000,
    });
    return user;
  };
  const historyIdOf = async (id: string) =>
    (await ctx.prisma.user.findUniqueOrThrow({ where: { id } })).gmailHistoryId;
  const messageIds = async () =>
    (await ctx.prisma.emailLog.findMany()).map((log) => log.messageId).sort();

  it('runPass ingests the new messages and advances the stored history ID', async () => {
    const user = await connectGoogle('100');

    await expect(push.runPass()).resolves.toBe(2);

    expect(users.history.list.mock.calls[0][0]).toMatchObject({ startHistoryId: '100' });
    expect(await ctx.prisma.emailLog.findMany({ orderBy: { messageId: 'asc' } })).toMatchObject([
      { messageId: '<m1@mail>', sender: 'Bank <no-reply@bank.vn>', rawBody: 'body of m1', status: 'PENDING' },
      { messageId: '<m2@mail>', subject: 'Balance change', rawBody: 'body of m2', status: 'PENDING' },
    ]);
    expect(await historyIdOf(user.id)).toBe('200');
  });

  it('a failed message fetch keeps the history ID; the rerun ingests without duplicates', async () => {
    const user = await connectGoogle('100');
    users.messages.get.mockImplementationOnce(async ({ id }: any) => gmailMessage(id));
    users.messages.get.mockRejectedValueOnce(httpError(500));

    await expect(push.runPass()).rejects.toThrow('HTTP 500');
    expect(await historyIdOf(user.id)).toBe('100');
    expect(await messageIds()).toEqual(['<m1@mail>']);

    await expect(push.runPass()).resolves.toBe(2);
    expect(await messageIds()).toEqual(['<m1@mail>', '<m2@mail>']);
    expect(await historyIdOf(user.id)).toBe('200');
  });

  it('a history ID that Google no longer knows falls back to the recent messages', async () => {
    const user = await connectGoogle('100');
    users.history.list.mockRejectedValueOnce(httpError(404));

    await expect(push.runPass()).resolves.toBe(1);

    expect(await messageIds()).toEqual(['<m3@mail>']);
    expect(await historyIdOf(user.id)).toBe('300');
  });

  it('renewWatch stores the history ID only when none is stored', async () => {
    const user = await connectGoogle(null);

    await push.renewWatch();
    expect(await historyIdOf(user.id)).toBe('90');

    users.watch.mockResolvedValueOnce({ data: { historyId: '95' } });
    await push.renewWatch();
    expect(users.watch).toHaveBeenCalledTimes(2);
    expect(await historyIdOf(user.id)).toBe('90');
  });
});
