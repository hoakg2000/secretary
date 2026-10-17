import { EmailRuleType } from '@prisma/client';
import { EmailAiService } from '../../src/email/email-ai.service';
import { EmailService } from '../../src/email/email.service';
import {
  classification,
  createTestModule,
  expectRejection,
  jsonResponse,
  resetState,
  seedAccount,
  seedEmailRule,
  waitForJob,
  waitForStatus,
  type TestContext,
} from './harness';

const SUMMARY = 'Tóm tắt email';

describe('email worker integration (real queue + real EmailProcessor)', () => {
  let ctx: TestContext;
  let emails: EmailService;
  let ai: EmailAiService;

  beforeAll(async () => {
    ctx = await createTestModule();
    emails = ctx.moduleRef.get(EmailService);
    ai = ctx.moduleRef.get(EmailAiService);
  });

  afterAll(() => ctx.close());

  beforeEach(() => resetState(ctx));

  const mail = (data: Record<string, unknown> = {}) => ({
    messageId: `<${Math.random().toString(36).slice(2)}@mail>`,
    sender: 'Bank <alerts@bank.example>',
    subject: 'Balance change',
    rawBody: 'Account 0011223344 changed',
    ...data,
  });
  const answer = (result: Record<string, unknown>) =>
    ctx.genAi.generateContent.mockResolvedValue(classification({ summary: SUMMARY, ...result }));
  /** ingest, then wait for the real worker to finish the job */
  const run = async (data: Record<string, unknown> = {}) => {
    const ingested = (await emails.ingest(mail(data)))!;
    const returned = await waitForJob(ctx, ingested.jobId!);
    return { ...ingested, returned };
  };
  const logOf = (id: string) => ctx.prisma.emailLog.findUniqueOrThrow({ where: { id } });
  const balance = async (id: string) =>
    Number((await ctx.prisma.bankAccount.findUniqueOrThrow({ where: { id } })).cachedBalance);
  const transactions = () => ctx.prisma.transaction.findMany();
  const events = () => ctx.prisma.localCalendar.findMany({ include: { syncState: true } });
  const txResult = (transaction: Record<string, unknown>) =>
    answer({ category: 'TRANSACTION', transaction: { amount: 500000, direction: 'INCOME', ...transaction } });
  /** nothing was written besides the log summary */
  const expectSummaryOnly = async (emailLogId: string) => {
    expect(await transactions()).toHaveLength(0);
    expect(await events()).toHaveLength(0);
    expect(await logOf(emailLogId)).toMatchObject({ status: 'PROCESSED', aiSummary: SUMMARY });
  };

  describe('TRANSACTION', () => {
    it('creates the transaction, moves the balance, links the email log and stores the summary', async () => {
      const account = await seedAccount(ctx.prisma);
      txResult({
        accountNumber: '0011223344',
        bankCode: 'vcb',
        currency: 'vnd',
        counterparty: 'Alice',
        time: '2030-02-03T04:05:06Z',
      });

      const done = await run();

      expect(done.returned).toMatchObject({ success: true, status: 'PROCESSED', category: 'TRANSACTION' });
      const [tx] = await transactions();
      expect(tx).toMatchObject({
        accountId: account.id,
        type: 'INCOME',
        counterparty: 'Alice',
        note: SUMMARY,
        emailLogId: done.emailLogId,
      });
      expect(Number(tx.amount)).toBe(500000);
      expect(tx.transactionTime.toISOString()).toBe('2030-02-03T04:05:06.000Z');
      expect(await balance(account.id)).toBe(1500000);
      expect(await logOf(done.emailLogId)).toMatchObject({ status: 'PROCESSED', aiSummary: SUMMARY });
    });

    it('subtracts the amount for an EXPENSE', async () => {
      const account = await seedAccount(ctx.prisma);
      txResult({ direction: 'EXPENSE', amount: 250000.5, accountNumber: '0011223344' });

      await run();

      expect(await balance(account.id)).toBe(749999.5);
    });

    it('matches on the account number alone', async () => {
      const account = await seedAccount(ctx.prisma);
      await seedAccount(ctx.prisma, { accountNumber: '9999', bankCode: 'TCB' });
      txResult({ accountNumber: '0011223344' });

      await run();

      expect((await transactions())[0].accountId).toBe(account.id);
    });

    it('matches on the bank code alone, ignoring case', async () => {
      const account = await seedAccount(ctx.prisma);
      txResult({ bankCode: 'Vcb' });

      await run();

      expect((await transactions())[0].accountId).toBe(account.id);
    });

    it('uses the current time when the model gives none', async () => {
      await seedAccount(ctx.prisma);
      txResult({ bankCode: 'VCB' });
      const before = Date.now();

      await run();

      const time = (await transactions())[0].transactionTime.getTime();
      expect(time).toBeGreaterThanOrEqual(before - 1000);
      expect(time).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it('saves only the summary when no account matches', async () => {
      await seedAccount(ctx.prisma);
      txResult({ accountNumber: '5555555555', bankCode: 'XYZ' });

      const done = await run();

      await expectSummaryOnly(done.emailLogId);
    });

    it('saves only the summary when more than one account matches', async () => {
      await seedAccount(ctx.prisma, { accountNumber: '111' });
      await seedAccount(ctx.prisma, { accountNumber: '222' });
      txResult({ bankCode: 'VCB' });

      const done = await run();

      await expectSummaryOnly(done.emailLogId);
    });

    it('ignores an inactive account', async () => {
      await seedAccount(ctx.prisma, { isActive: false });
      txResult({ accountNumber: '0011223344' });

      const done = await run();

      await expectSummaryOnly(done.emailLogId);
    });

    it('saves only the summary when the model gives neither account number nor bank code', async () => {
      const account = await seedAccount(ctx.prisma);
      txResult({});

      const done = await run();

      await expectSummaryOnly(done.emailLogId);
      expect(await balance(account.id)).toBe(1000000);
    });

    it('saves only the summary when the currency differs from the account currency', async () => {
      const account = await seedAccount(ctx.prisma);
      txResult({ accountNumber: '0011223344', currency: 'USD' });

      const done = await run();

      await expectSummaryOnly(done.emailLogId);
      expect(await balance(account.id)).toBe(1000000);
    });

    it.each([
      ['a negative amount', { amount: -5 }],
      ['a zero amount', { amount: 0 }],
      ['an amount that is not a number', { amount: '500' }],
      ['a time that is not a date', { time: 'garbage' }],
      ['a direction that is not INCOME or EXPENSE', { direction: 'SIDEWAYS' }],
    ])('saves only the summary for %s', async (_name, transaction) => {
      const account = await seedAccount(ctx.prisma);
      txResult({ accountNumber: '0011223344', ...transaction });

      const done = await run();

      await expectSummaryOnly(done.emailLogId);
      expect(await balance(account.id)).toBe(1000000);
    });

    it('saves only the summary when the category is TRANSACTION but the model gives no transaction', async () => {
      await seedAccount(ctx.prisma);
      answer({ category: 'TRANSACTION' });

      const done = await run();

      await expectSummaryOnly(done.emailLogId);
    });

    it('does not apply the balance twice when the transaction for this email already exists', async () => {
      const account = await seedAccount(ctx.prisma);
      const log = await ctx.prisma.emailLog.create({ data: { messageId: '<dup>', sender: 'a@b.c' } });
      await ctx.prisma.transaction.create({
        data: { accountId: account.id, amount: 500000, type: 'INCOME', transactionTime: new Date(), emailLogId: log.id },
      });
      txResult({ accountNumber: '0011223344' });
      const job = await ctx.queue.add(
        'process-email-job',
        { emailLogId: log.id, messageId: '<dup>', sender: 'a@b.c', ruleType: null },
        { jobId: log.id },
      );

      await waitForJob(ctx, job.id!);

      expect(await transactions()).toHaveLength(1);
      expect(await balance(account.id)).toBe(1000000);
      expect((await logOf(log.id)).status).toBe('PROCESSED');
    });
  });

  describe('EVENT', () => {
    it('creates a DIRTY local calendar event with a one hour default length', async () => {
      answer({
        category: 'EVENT',
        event: { title: 'Project sync', start: '2030-05-01T09:00:00+07:00', location: 'HQ' },
      });

      const done = await run();

      const [event] = await events();
      expect(event).toMatchObject({ title: 'Project sync', location: 'HQ', description: SUMMARY });
      expect(event.startTime.toISOString()).toBe('2030-05-01T02:00:00.000Z');
      expect(event.endTime.toISOString()).toBe('2030-05-01T03:00:00.000Z');
      expect(event.syncState).toMatchObject({ syncStatus: 'DIRTY', googleEventId: null });
      expect(await logOf(done.emailLogId)).toMatchObject({ status: 'PROCESSED', aiSummary: SUMMARY });
      expect(await transactions()).toHaveLength(0);
    });

    it('uses the end time from the model', async () => {
      answer({
        category: 'EVENT',
        event: { title: 'Workshop', start: '2030-05-01T09:00:00Z', end: '2030-05-01T12:30:00Z' },
      });

      await run();

      expect((await events())[0].endTime.toISOString()).toBe('2030-05-01T12:30:00.000Z');
    });

    it('saves only the summary when the end is not after the start', async () => {
      answer({
        category: 'EVENT',
        event: { title: 'Backwards', start: '2030-05-01T09:00:00Z', end: '2030-05-01T08:00:00Z' },
      });

      const done = await run();

      await expectSummaryOnly(done.emailLogId);
    });

    it('saves only the summary when the start is not a date', async () => {
      answer({ category: 'EVENT', event: { title: 'Someday', start: 'next week' } });

      const done = await run();

      await expectSummaryOnly(done.emailLogId);
    });

    it('saves only the summary when the title is empty', async () => {
      answer({ category: 'EVENT', event: { title: '', start: '2030-05-01T09:00:00Z' } });

      const done = await run();

      await expectSummaryOnly(done.emailLogId);
    });
  });

  describe('OTHER and urgent', () => {
    it('stores the summary only for category OTHER and sends no Telegram message', async () => {
      await seedAccount(ctx.prisma);
      answer({ category: 'OTHER' });

      const done = await run();

      expect(done.returned).toMatchObject({ category: 'OTHER' });
      await expectSummaryOnly(done.emailLogId);
      expect(ctx.http.callsTo('api.telegram.org')).toHaveLength(0);
    });

    it('sends the summary to Telegram for an urgent email', async () => {
      answer({ category: 'OTHER', urgent: true });

      await run({ sender: 'Boss <boss@example.com>' });

      const sent = ctx.http.callsTo('api.telegram.org');
      expect(sent).toHaveLength(1);
      expect(sent[0].method).toBe('POST');
      expect(sent[0].json).toEqual({ chat_id: 'test', text: `Email khẩn từ Boss <boss@example.com>: ${SUMMARY}` });
    });

    it('still processes the email when Telegram answers an error', async () => {
      ctx.http.respond('api.telegram.org', jsonResponse({ ok: false }, 500));
      answer({ category: 'OTHER', urgent: true });

      const done = await run();

      expect(ctx.http.callsTo('api.telegram.org')).toHaveLength(1);
      expect(await logOf(done.emailLogId)).toMatchObject({ status: 'PROCESSED', aiSummary: SUMMARY });
    });

    it('still processes the email when the Telegram request cannot be made', async () => {
      ctx.http.fail('api.telegram.org');
      answer({ category: 'OTHER', urgent: true });

      const done = await run();

      expect((await logOf(done.emailLogId)).status).toBe('PROCESSED');
      expect(ctx.genAi.generateContent).toHaveBeenCalledTimes(1);
    });

    it('does not notify for an urgent flag that is not exactly true', async () => {
      ctx.genAi.generateContent.mockResolvedValue({
        text: JSON.stringify({ category: 'OTHER', summary: SUMMARY, urgent: 'true' }),
      });

      await run();

      expect(ctx.http.callsTo('api.telegram.org')).toHaveLength(0);
    });
  });

  describe('idempotency', () => {
    it('does not call the model or change anything for a log that is already PROCESSED', async () => {
      const log = await ctx.prisma.emailLog.create({
        data: { messageId: '<done>', sender: 'a@b.c', status: 'PROCESSED', aiSummary: 'kept' },
      });
      const job = await ctx.queue.add(
        'process-email-job',
        { emailLogId: log.id, messageId: '<done>', sender: 'a@b.c', ruleType: null },
        { jobId: log.id },
      );

      const returned = await waitForJob(ctx, job.id!);

      expect(returned).toEqual({ success: true, emailLogId: log.id, status: 'PROCESSED' });
      expect(ctx.genAi.generateContent).not.toHaveBeenCalled();
      expect((await logOf(log.id)).aiSummary).toBe('kept');
      expect(await events()).toHaveLength(0);
    });
  });

  describe('prompt selection by rule type', () => {
    const promptOf = () => ctx.genAi.generateContent.mock.calls[0][0];

    it('uses the finance prompt for a moneylist sender', async () => {
      await seedEmailRule(ctx.prisma, { type: EmailRuleType.moneylist, matchValue: 'alerts@bank' });
      answer({ category: 'OTHER' });

      const done = await run();

      expect(done.ruleType).toBe('moneylist');
      expect(promptOf().contents).toContain("owner's finance list");
    });

    it('uses the important-sender prompt for a whitelist sender', async () => {
      await seedEmailRule(ctx.prisma, { type: EmailRuleType.whitelist, matchValue: 'alerts@bank' });
      answer({ category: 'OTHER' });

      await run();

      expect(promptOf().contents).toContain("owner's list of important senders");
    });

    it('uses the no-rule prompt when no rule matches', async () => {
      answer({ category: 'OTHER' });

      await run();

      expect(promptOf().contents).toContain('No rule matched this sender');
    });

    it('sends the email content and a JSON response config to the model', async () => {
      answer({ category: 'OTHER' });

      await run({ subject: 'Special subject', rawBody: 'Special body' });

      const request = promptOf();
      expect(request.contents).toContain('From: Bank <alerts@bank.example>');
      expect(request.contents).toContain('Subject: Special subject');
      expect(request.contents).toContain('Special body');
      expect(request.config).toMatchObject({ responseMimeType: 'application/json' });
      expect(request.config.systemInstruction).toBeTruthy();
      expect(request.config.tools).toBeUndefined();
    });
  });

  describe('failure and reprocess', () => {
    it(
      'retries an invalid model answer, marks the log FAILED after the last attempt, then reprocess succeeds',
      { timeout: 40_000 },
      async () => {
        ctx.genAi.generateContent.mockResolvedValue({ text: 'this is not json' });
        const ingested = (await emails.ingest(mail()))!;

        const failed = await waitForStatus(ctx.prisma, ingested.emailLogId, 'FAILED', 35_000);

        expect(failed.aiSummary).toBeNull();
        expect(ctx.genAi.generateContent).toHaveBeenCalledTimes(3);
        expect((await ctx.queue.getJob(ingested.emailLogId))!.attemptsMade).toBe(3);

        answer({ category: 'OTHER' });
        const again = await emails.reprocess(ingested.emailLogId);
        await waitForJob(ctx, again.jobId!);

        expect(await logOf(ingested.emailLogId)).toMatchObject({ status: 'PROCESSED', aiSummary: SUMMARY });
        expect(ctx.genAi.generateContent).toHaveBeenCalledTimes(4);
      },
    );
  });

  describe('EmailAiService.buildPrompt', () => {
    it('wraps the email between matching random boundary lines', () => {
      const prompt = ai.buildPrompt({ sender: 's@x.com', subject: 'Subj', rawBody: 'Body' }, null);

      const lines = prompt.split('\n');
      const start = lines.find((l) => l.startsWith('<<<EMAIL '))!;
      const id = start.replace('<<<EMAIL ', '');
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect(lines).toContain(`${id} EMAIL>>>`);
      expect(lines).toContain('From: s@x.com');
      expect(lines).toContain('Subject: Subj');
      expect(lines).toContain('Body');
    });

    it('uses a different boundary for each prompt', () => {
      const a = ai.buildPrompt({ sender: 's' }, null);
      const b = ai.buildPrompt({ sender: 's' }, null);

      expect(a.match(/<<<EMAIL (\S+)/)![1]).not.toBe(b.match(/<<<EMAIL (\S+)/)![1]);
    });

    it('handles a missing subject and body', () => {
      const prompt = ai.buildPrompt({ sender: 's' }, null);

      expect(prompt).toContain('Subject: \n');
    });

    it('cuts the body at 20000 characters', () => {
      const prompt = ai.buildPrompt({ sender: 's', rawBody: `${'a'.repeat(20_000)}TAIL` }, null);

      expect(prompt).toContain('a'.repeat(20_000));
      expect(prompt).not.toContain('TAIL');
    });

    it('states the configured time zone', () => {
      expect(ai.buildPrompt({ sender: 's' }, null)).toContain('in Asia/Ho_Chi_Minh');
    });

    it.each([
      [EmailRuleType.moneylist, "owner's finance list"],
      [EmailRuleType.whitelist, "owner's list of important senders"],
      [null, 'No rule matched this sender'],
    ])('picks the task for rule type %s', (type, marker) => {
      expect(ai.buildPrompt({ sender: 's' }, type)).toContain(marker);
    });
  });

  describe('EmailAiService.classify', () => {
    const email = { sender: 's@x.com', subject: 'S', rawBody: 'B' };

    it('returns the parsed classification with the urgent flag as a boolean', async () => {
      ctx.genAi.generateContent.mockResolvedValue({
        text: JSON.stringify({ category: 'OTHER', summary: 'ok' }),
      });

      expect(await ai.classify(email, null)).toEqual({ category: 'OTHER', summary: 'ok', urgent: false });
    });

    it.each([
      ['text that is not JSON', { text: 'nope' }],
      ['no text', {}],
      ['an unknown category', { text: JSON.stringify({ category: 'SPAM', summary: 's' }) }],
      ['a missing category', { text: JSON.stringify({ summary: 's' }) }],
      ['a missing summary', { text: JSON.stringify({ category: 'OTHER' }) }],
      ['a summary that is not a string', { text: JSON.stringify({ category: 'OTHER', summary: 5 }) }],
      ['JSON null', { text: 'null' }],
    ])('rejects %s', async (_name, response) => {
      ctx.genAi.generateContent.mockResolvedValue(response);

      await expectRejection(ai.classify(email, null), Error); // SyntaxError from JSON.parse or the schema Error
    });

    it('passes a model failure through', async () => {
      ctx.genAi.generateContent.mockRejectedValue(new Error('quota'));

      await expect(ai.classify(email, null)).rejects.toThrow('quota');
    });
  });
});
