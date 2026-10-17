import { SchedulerRegistry } from '@nestjs/schedule';
import { EmailStatus } from '@prisma/client';
import { Redis } from 'ioredis';
import { google } from 'googleapis';
import { EmailService } from '../../src/email/email.service';
import { TelegramClient } from '../../src/proactive/telegram.client';
import {
  classification,
  createTestModule,
  resetState,
  seedUser,
  TEST_QUEUE_PREFIX,
  waitForJob,
  waitForStatus,
  type TestContext,
} from './harness';

describe('integration harness', () => {
  let ctx: TestContext;
  let redis: Redis;

  beforeAll(async () => {
    ctx = await createTestModule();
    redis = new Redis({ host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT) });
  });

  afterAll(async () => {
    redis.disconnect();
    await ctx.close();
  });

  beforeEach(() => resetState(ctx));

  describe('database', () => {
    it('is reachable and is the _test database', async () => {
      const [{ name }] = await ctx.prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
      expect(name).toMatch(/_test$/);
    });

    it('truncates seeded rows in resetState', async () => {
      await seedUser(ctx.prisma);
      expect(await ctx.prisma.user.count()).toBe(1);

      await resetState(ctx);

      expect(await ctx.prisma.user.count()).toBe(0);
    });
  });

  describe('redis prefix isolation', () => {
    it('gives the real queue the test prefix', () => {
      expect(ctx.queue.opts.prefix).toBe(TEST_QUEUE_PREFIX);
    });

    it('gives the real worker the test prefix', async () => {
      const emailService = ctx.moduleRef.get(EmailService);
      ctx.llm.answerAll(classification({ category: 'OTHER', summary: 's' }));
      const result = await emailService.ingest({ messageId: '<prefix@test>', sender: 'a@b.c', subject: 'x' });
      await waitForJob(ctx, result!.jobId!);

      // The job was consumed by the worker bound to the test prefix, not to the default "bull" prefix
      expect(await redis.exists(`${TEST_QUEUE_PREFIX}:email-processing:${result!.jobId}`)).toBe(1);
      expect(await redis.exists(`bull:email-processing:${result!.jobId}`)).toBe(0);
    });
  });

  describe('real email ingest through the real queue and worker', () => {
    it('puts a job under the prefix and the worker moves the log to PROCESSED', async () => {
      ctx.llm.script.push(classification({ category: 'OTHER', summary: 'Quảng cáo' }));

      const result = await ctx.moduleRef.get(EmailService).ingest({
        messageId: '<smoke@test>',
        sender: 'shop@example.com',
        subject: 'Sale',
        rawBody: 'buy now',
      });

      expect(result).toMatchObject({ status: EmailStatus.PENDING });
      expect(await redis.exists(`${TEST_QUEUE_PREFIX}:email-processing:${result!.jobId}`)).toBe(1);

      const returned = await waitForJob(ctx, result!.jobId!);
      expect(returned).toMatchObject({ success: true, status: EmailStatus.PROCESSED });

      const log = await waitForStatus(ctx.prisma, result!.emailLogId, EmailStatus.PROCESSED);
      expect(log.aiSummary).toBe('Quảng cáo');
      expect(ctx.llm.sendMessageLLM).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetch stub', () => {
    it('throws on an unknown host', async () => {
      await expect(fetch('https://example.com/x')).rejects.toThrow('unmocked fetch');
    });

    it('routes a Telegram message through the real TelegramClient and records it', async () => {
      const status = await ctx.moduleRef.get(TelegramClient).sendMessage('hello');

      expect(status).toBe('SENT');
      expect(ctx.http.callsTo('api.telegram.org')).toHaveLength(1);
      expect(ctx.http.calls[0].json).toEqual({ chat_id: 'test', text: 'hello' });
    });

    it('forgets calls and per-test responses on reset', async () => {
      ctx.http.respond('api.telegram.org', new Response('nope', { status: 500 }));
      expect(await ctx.moduleRef.get(TelegramClient).sendMessage('x')).toBe('FAILED');

      await resetState(ctx);

      expect(ctx.http.calls).toHaveLength(0);
      expect(await ctx.moduleRef.get(TelegramClient).sendMessage('x')).toBe('SENT');
    });
  });

  describe('google spies', () => {
    it('replaces google.calendar, google.gmail and the OAuth2 token calls', async () => {
      expect(vi.isMockFunction(google.calendar)).toBe(true);
      expect(vi.isMockFunction(google.gmail)).toBe(true);
      expect(vi.isMockFunction(google.auth.OAuth2.prototype.getToken)).toBe(true);
      expect(vi.isMockFunction(google.auth.OAuth2.prototype.verifyIdToken)).toBe(true);

      ctx.google.getToken.mockResolvedValueOnce({ tokens: { access_token: 'a' } });
      const { tokens } = await new google.auth.OAuth2().getToken('code');
      expect(tokens.access_token).toBe('a');
    });

    it('restores the originals on restore()', () => {
      ctx.google.restore();

      expect(vi.isMockFunction(google.calendar)).toBe(false);
      expect(vi.isMockFunction(google.auth.OAuth2.prototype.getToken)).toBe(false);

      ctx.google.install();
    });
  });

  describe('cron', () => {
    it('registers no cron job and starts none', () => {
      const registry = ctx.moduleRef.get(SchedulerRegistry, { strict: false });
      expect(registry.getCronJobs().size).toBe(0);
    });
  });
});
