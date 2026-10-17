import { ExecutionContext, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { SchedulerRegistry } from '@nestjs/schedule';
import { GenAiProvider } from '../../src/ai-agent/genai.provider';
import { PendingActionStore } from '../../src/ai-agent/services/agent/pending-action.store';
import { RagChunkService } from '../../src/ai-agent/services/rag-chunk/rag-chunk.service';
import { AppService } from '../../src/app.service';
import { GoogleClientFactory } from '../../src/auth/google-client.factory';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { CalendarSyncService } from '../../src/calendar/calendar-sync.service';
import { Public } from '../../src/common/decorators/public.decorator';
import { decryptToken, encryptToken } from '../../src/common/crypto/token-cipher';
import { EmailProcessor } from '../../src/email/email.processor';
import { GmailPushService } from '../../src/email/gmail-push.service';
import { EmailStatus, Prisma } from '@prisma/client';
import type { Job } from 'bullmq';
import {
  createTestModule,
  rejection,
  resetState,
  seedGoogleUser,
  type TestContext,
} from './harness';

describe('misc: small services and helpers', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestModule();
  });

  afterAll(() => ctx.close());

  beforeEach(() => resetState(ctx));

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('AppService.getHello', () => {
    it('returns the greeting', () => {
      expect(ctx.moduleRef.get(AppService).getHello()).toBe('Hello World!');
    });
  });

  describe('GenAiProvider (real class)', () => {
    it('throws 503 when GEMINI_API_KEY is not configured', () => {
      const config = ctx.moduleRef.get(ConfigService);
      vi.spyOn(config, 'get').mockReturnValue(undefined);

      expect(() => new GenAiProvider(config).get()).toThrow(ServiceUnavailableException);
    });

    it('builds one client and reuses it', () => {
      const config = ctx.moduleRef.get(ConfigService);
      vi.spyOn(config, 'get').mockReturnValue('fake-key');
      const provider = new GenAiProvider(config);

      const first = provider.get();

      expect(first).toBeDefined();
      expect(provider.get()).toBe(first);
    });
  });

  describe('JwtAuthGuard.canActivate', () => {
    class PublicController {
      @Public()
      open() {}

      closed() {}
    }

    const contextFor = (handler: () => void): ExecutionContext =>
      ({
        getHandler: () => handler,
        getClass: () => PublicController,
        getType: () => 'http',
        getArgs: () => [],
        switchToHttp: () => ({
          getRequest: () => ({ headers: {} }),
          getResponse: () => ({}),
        }),
      }) as unknown as ExecutionContext;

    it('lets a @Public route through without a token', () => {
      const guard = new JwtAuthGuard(ctx.moduleRef.get(Reflector));

      expect(guard.canActivate(contextFor(PublicController.prototype.open))).toBe(true);
    });

    it('rejects a protected route that has no bearer token', async () => {
      const guard = new JwtAuthGuard(ctx.moduleRef.get(Reflector));

      await expect(
        Promise.resolve(guard.canActivate(contextFor(PublicController.prototype.closed))),
      ).rejects.toMatchObject({ status: 401 });
    });
  });

  describe('PrismaService', () => {
    it('onModuleInit connects and the database answers', async () => {
      await ctx.prisma.onModuleInit();

      const [{ ok }] = await ctx.prisma.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;
      expect(ok).toBe(1);
    });
  });

  describe('token cipher', () => {
    const key = Buffer.alloc(32, 7).toString('base64');

    it('round-trips a token and never stores it in clear', () => {
      const blob = encryptToken('secret-token', key);

      expect(blob.startsWith('v1:')).toBe(true);
      expect(blob).not.toContain('secret-token');
      expect(decryptToken(blob, key)).toBe('secret-token');
    });

    it('uses a fresh IV, so equal inputs give different blobs', () => {
      expect(encryptToken('same', key)).not.toBe(encryptToken('same', key));
    });

    it('rejects a key that is not 32 bytes', () => {
      expect(() => encryptToken('x', Buffer.alloc(16).toString('base64'))).toThrow('32 bytes');
    });

    it('rejects an unknown format', () => {
      expect(() => decryptToken('v2:a:b:c', key)).toThrow('Unrecognised');
      expect(() => decryptToken('plain', key)).toThrow('Unrecognised');
    });

    it('rejects a tampered ciphertext', () => {
      const [v, iv, tag, ct] = encryptToken('secret-token', key).split(':');
      const flipped = Buffer.from(ct, 'base64');
      flipped[0] ^= 0xff;

      expect(() => decryptToken([v, iv, tag, flipped.toString('base64')].join(':'), key)).toThrow();
    });

    it('rejects the wrong key', () => {
      const blob = encryptToken('secret-token', key);

      expect(() => decryptToken(blob, Buffer.alloc(32, 9).toString('base64'))).toThrow();
    });
  });

  describe('PendingActionStore', () => {
    it('take returns an action once, then undefined', () => {
      const store = new PendingActionStore();
      const action = store.add('tool', { a: 1 });

      expect(store.take(action.id)).toMatchObject({ toolName: 'tool', args: { a: 1 } });
      expect(store.take(action.id)).toBeUndefined();
    });

    it('take returns undefined for an unknown id', () => {
      expect(new PendingActionStore().take('nope')).toBeUndefined();
    });

    it('add purges expired actions', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const store = new PendingActionStore();
      const old = store.add('old', {});

      vi.setSystemTime(new Date('2026-01-01T00:06:00Z'));
      store.add('new', {});

      expect((store as any).actions.has(old.id)).toBe(false);
      expect((store as any).actions.size).toBe(1);
    });
  });

  describe('GoogleClientFactory refreshed tokens', () => {
    it('logs and does not crash when saving a refreshed token fails', async () => {
      const factory = ctx.moduleRef.get(GoogleClientFactory);
      const user = await seedGoogleUser(ctx.prisma, factory);
      const client = (await factory.forUser(user.id))!;
      const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
      vi.spyOn(factory, 'saveTokens').mockRejectedValue(new Error('db down'));

      client.emit('tokens', { access_token: 'AT-new' });

      await vi.waitFor(() =>
        expect(error).toHaveBeenCalledWith('Không lưu được Google token đã làm mới', expect.any(Error)),
      );
    });
  });

  describe('cron registration at bootstrap', () => {
    const cleanup = (registry: SchedulerRegistry, name: string) => {
      registry.getCronJob(name).stop();
      registry.deleteCronJob(name);
    };

    it('CalendarSyncService registers and starts the calendar-sync job', () => {
      const registry = ctx.moduleRef.get(SchedulerRegistry);

      ctx.moduleRef.get(CalendarSyncService).onApplicationBootstrap();

      try {
        const job = registry.getCronJob('calendar-sync');
        expect(job.isActive).toBe(true);
      } finally {
        cleanup(registry, 'calendar-sync');
      }
    });

    it('GmailPushService registers the gmail-watch job and renews once at startup', () => {
      const registry = ctx.moduleRef.get(SchedulerRegistry);
      const push = ctx.moduleRef.get(GmailPushService);
      const renew = vi.spyOn(push, 'renewWatch').mockResolvedValue(undefined);

      push.onApplicationBootstrap();

      try {
        expect(registry.getCronJob('gmail-watch').isActive).toBe(true);
        expect(renew).toHaveBeenCalledTimes(1);
      } finally {
        cleanup(registry, 'gmail-watch');
      }
    });
  });

  describe('EmailProcessor.onFailed', () => {
    const fakeJob = (emailLogId: string, attemptsMade: number) =>
      ({ id: 'j1', data: { emailLogId }, attemptsMade, opts: { attempts: 3 } }) as unknown as Job<any>;
    const newLog = () =>
      ctx.prisma.emailLog.create({ data: { messageId: '<f@x>', sender: 'a@b.c', status: EmailStatus.PENDING } });

    it('keeps PENDING while retries remain', async () => {
      const log = await newLog();

      await ctx.moduleRef.get(EmailProcessor).onFailed(fakeJob(log.id, 1), new Error('x'));

      expect((await ctx.prisma.emailLog.findUniqueOrThrow({ where: { id: log.id } })).status).toBe('PENDING');
    });

    it('marks FAILED on the last attempt', async () => {
      const log = await newLog();

      await ctx.moduleRef.get(EmailProcessor).onFailed(fakeJob(log.id, 3), new Error('x'));

      expect((await ctx.prisma.emailLog.findUniqueOrThrow({ where: { id: log.id } })).status).toBe('FAILED');
    });

    it('only logs when the FAILED update itself fails', async () => {
      const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

      await expect(
        ctx.moduleRef.get(EmailProcessor).onFailed(fakeJob('00000000-0000-0000-0000-000000000000', 3), new Error('x')),
      ).resolves.toBeUndefined();

      expect(error).toHaveBeenCalledWith(expect.stringContaining('Không cập nhật được trạng thái FAILED'));
    });

    it('ignores an undefined job', async () => {
      await expect(ctx.moduleRef.get(EmailProcessor).onFailed(undefined, new Error('x'))).resolves.toBeUndefined();
    });
  });

  describe('RagChunkService errors', () => {
    it('splitAndSaveDocument rethrows when the database rejects a chunk', async () => {
      // Postgres text cannot hold a NUL byte
      const error = await rejection(ctx.moduleRef.get(RagChunkService).splitAndSaveDocument('bad', 'a\u0000b'));

      expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

      expect(await ctx.prisma.ragChunk.count({ where: { sourceId: 'bad' } })).toBe(0);
    });
  });
});
