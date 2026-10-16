import { randomUUID } from 'node:crypto';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { GenAiProvider } from '../../src/ai-agent/genai.provider';
import { AgentService } from '../../src/ai-agent/services/agent/agent.service';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TelegramClient } from '../../src/proactive/telegram.client';

// Safety net: no test may reach a real third party
vi.stubGlobal('fetch', async (input: any) => {
  throw new Error(`unmocked fetch: ${input?.url ?? input}`);
});

export const EMBEDDING_DIMENSIONS = 1536;

export const httpError = (status: number) =>
  Object.assign(new Error(`HTTP ${status}`), { status });

// Chat stream chunks, same shape as agent.service.spec.ts
export const text = (value: string) => ({
  candidates: [{ content: { parts: [{ text: value }] } }],
});
export const calls = (...functionCalls: any[]) => ({ functionCalls });

function createFakeGenAi() {
  /** text -> axis of its one-hot embedding; unknown text is on axis 0 */
  const axes = new Map<string, number>();
  /** chunks of each model round, consumed in order */
  const script: any[][] = [];

  const embedContent = vi.fn(async ({ contents }: any) => {
    const values = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
    values[axes.get(contents) ?? 0] = 1;
    return { embeddings: [{ values }] };
  });
  const generateContent = vi.fn();
  const sendMessageStream = vi.fn(async (_params: any) => {
    const chunks = script.shift() ?? [text('')];
    return (async function* () {
      yield* chunks;
    })();
  });
  const create = vi.fn((_params: any) => ({ sendMessageStream }));

  return {
    axes,
    script,
    embedContent,
    generateContent,
    sendMessageStream,
    create,
    get: () => ({ models: { embedContent, generateContent }, chats: { create } }),
  };
}

/** AppModule compiled but never initialised: no cron job, no BullMQ worker, no renewWatch */
export async function createTestModule() {
  const queue = {
    add: vi.fn(async (_name: string, _data: any, opts: any) => ({ id: opts.jobId })),
  };
  const telegram = { sendMessage: vi.fn(async (_text: string) => 'SENT') };
  const genAi = createFakeGenAi();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(getQueueToken('email-processing'))
    .useValue(queue)
    .overrideProvider(GenAiProvider)
    .useValue(genAi)
    .overrideProvider(TelegramClient)
    .useValue(telegram)
    .compile();

  moduleRef.get(AgentService).onModuleInit();

  return { moduleRef, prisma: moduleRef.get(PrismaService), queue, telegram, genAi };
}

export type TestContext = Awaited<ReturnType<typeof createTestModule>>;

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

export function seedUser(prisma: PrismaService, data: Record<string, unknown> = {}) {
  return prisma.user.create({
    data: { email: `${randomUUID()}@test.local`, ...data },
  });
}

export function seedAccount(prisma: PrismaService, data: Record<string, unknown> = {}) {
  return prisma.bankAccount.create({
    data: {
      accountName: 'Main',
      bankCode: 'VCB',
      accountNumber: '0011223344',
      cachedBalance: 1000000,
      ...data,
    },
  });
}
