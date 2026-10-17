import { BullRegistrar, getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Queue, QueueEvents } from 'bullmq';
import { GenAiProvider } from '../../src/ai-agent/genai.provider';
import { AgentService } from '../../src/ai-agent/services/agent/agent.service';
import { AppModule } from '../../src/app.module';
import { LlmService } from '../../src/llm/llm.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { EmailProcessor } from '../../src/email/email.processor';
import { createConfigOverride } from './support/config';
import { createFakeGenAi } from './support/genai';
import { createFakeLlm } from './support/llm';
import { createGoogleSpies } from './support/google';
import { createFetchStub } from './support/http';

export * from './support/errors';
export * from './support/genai';
export * from './support/llm';
export * from './support/seed';
export * from './support/wait';
export { jsonResponse, sseResponse } from './support/http';
export { googleError } from './support/google';

/** Every BullMQ key of the suite lives under this prefix, so a dev worker on the same Redis never sees it */
export const TEST_QUEUE_PREFIX = 'secretary-test';
export const EMAIL_QUEUE = 'email-processing';
// internal token of @nestjs/bullmq (getSharedConfigToken() of the default config)
const BULL_SHARED_CONFIG_TOKEN = 'BULLMQ_CONFIG(default)';

/**
 * AppModule compiled but never initialised (no init()): no @Cron, no calendar-sync / gmail-watch CronJob,
 * no startup renewWatch. What the tests need is started by hand: Prisma, the real BullMQ worker,
 * worker concurrency and the agent tool discovery.
 */
export async function createTestModule() {
  const genAi = createFakeGenAi();
  const llm = createFakeLlm();
  const http = createFetchStub();
  const google = createGoogleSpies();

  // Safety net: no test may reach a real third party
  vi.stubGlobal('fetch', http.fetchStub);
  google.install();

  const connection = {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
  };

  let moduleRef: Awaited<ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>> | undefined;
  let queueEvents: QueueEvents | undefined;
  try {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // Nest logs are noise here; tests that spy Logger.prototype still see every call
      .setLogger({ log: () => undefined, error: () => undefined, warn: () => undefined })
      .overrideProvider(GenAiProvider)
      .useValue(genAi)
      .overrideProvider(LlmService)
      .useValue(llm)
      .overrideProvider(BULL_SHARED_CONFIG_TOKEN)
      .useValue({ connection, prefix: TEST_QUEUE_PREFIX })
      .compile();

    const prisma = moduleRef.get(PrismaService);
    await prisma.$connect();

    const queue = moduleRef.get<Queue>(getQueueToken(EMAIL_QUEUE));
    assertTestPrefix(queue);
    queueEvents = new QueueEvents(EMAIL_QUEUE, { connection, prefix: TEST_QUEUE_PREFIX });
    await queueEvents.waitUntilReady();

    // BullModule would do this in onModuleInit: start the real worker
    await moduleRef.get(BullRegistrar, { strict: false }).register();
    moduleRef.get(EmailProcessor).onApplicationBootstrap();
    moduleRef.get(AgentService).onModuleInit();

    const ref = moduleRef;
    const events = queueEvents;
    const config = createConfigOverride(ref.get(ConfigService));
    return {
      moduleRef: ref,
      prisma,
      queue,
      queueEvents: events,
      genAi,
      llm,
      http,
      google,
      config,
      /** closes worker, QueueEvents, queue, Prisma; restores the config and Google spies and the fetch stub */
      async close() {
        config.restore();
        await ref.get(EmailProcessor).worker.close();
        await events.close();
        await ref.close();
        google.restore();
        vi.unstubAllGlobals();
      },
    };
  } catch (error) {
    await queueEvents?.close().catch(() => undefined);
    await moduleRef?.close().catch(() => undefined);
    google.restore();
    vi.unstubAllGlobals();
    throw error;
  }
}

/** Overrides config keys until the next resetState (undefined = missing, other keys read the real config) */
export function overrideConfig(ctx: TestContext, values: Record<string, string | undefined>) {
  ctx.config.override(values);
}

export type TestContext = Awaited<ReturnType<typeof createTestModule>>;

function assertTestPrefix(queue: Queue) {
  if (queue.opts.prefix !== TEST_QUEUE_PREFIX) {
    throw new Error(`Refusing to run: queue prefix is "${queue.opts.prefix}", expected "${TEST_QUEUE_PREFIX}"`);
  }
}

export async function resetDb(prisma: PrismaService) {
  const [{ name }] = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to truncate database "${name}"`);
  }

  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}

/** Between tests: truncate the DB, empty the test queue, reset the fakes, the fetch stub and the Google spies */
export async function resetState(ctx: TestContext) {
  assertTestPrefix(ctx.queue);
  await resetDb(ctx.prisma);
  await ctx.queue.obliterate({ force: true });
  ctx.genAi.reset();
  ctx.llm.reset();
  ctx.http.reset();
  ctx.config.restore();
  ctx.google.reset();
}

/** Jobs of the test queue in any state */
export async function totalJobs(ctx: TestContext) {
  return Object.values(await ctx.queue.getJobCounts()).reduce((sum, n) => sum + n, 0);
}
