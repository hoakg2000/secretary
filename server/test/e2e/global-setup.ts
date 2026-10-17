import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { GoogleGenAI, Type } from '@google/genai';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { Redis } from 'ioredis';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { seedCharacters } from '../../prisma/seed-characters';
import { CHAT_MODEL, REPLY_SCHEMA } from '../../src/ai-agent/services/agent/agent.service';
import { classifyThirdParty, type ThirdPartyKind } from './support/classify';
import { excerpt, redact } from './support/redact';

declare module 'vitest' {
  export interface ProvidedContext {
    e2eUser: { email: string; password: string };
  }
}

const QUEUE_PREFIX = 'secretary-e2e';

type Check = { name: string; ok: boolean; ms: number; detail?: string; kind?: ThirdPartyKind };

/** One minimal real call per provider feature the flows depend on */
async function preflight(env: Record<string, string>): Promise<Check[]> {
  const checks: Check[] = [];
  const run = async (name: string, call: () => Promise<unknown>) => {
    const started = Date.now();
    try {
      await call();
      checks.push({ name, ok: true, ms: Date.now() - started });
    } catch (error) {
      const message = (error as Error).message ?? String(error);
      checks.push({
        name,
        ok: false,
        ms: Date.now() - started,
        detail: message,
        // anything the provider rejects before a flow even starts is a third-party problem
        kind: classifyThirdParty(message) ?? 'THIRD_PARTY_OTHER',
      });
    }
  };

  if (!env.GEMINI_API_KEY) {
    checks.push({
      name: 'GEMINI_API_KEY is set',
      ok: false,
      ms: 0,
      detail: 'GEMINI_API_KEY is empty in server/.env',
      kind: 'THIRD_PARTY_AUTH',
    });
    return checks;
  }
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

  await run(`generateContent ${CHAT_MODEL} with REPLY_SCHEMA and a tool`, () =>
    ai.models.generateContent({
      model: CHAT_MODEL,
      contents: 'Chào bạn',
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: REPLY_SCHEMA,
        tools: [
          {
            functionDeclarations: [
              { name: 'get_time', description: 'Giờ hiện tại', parameters: { type: Type.OBJECT, properties: {} } },
            ],
          },
        ],
      },
    }),
  );
  // same default as MemoryService.generateEmbedding
  const embeddingModel = env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
  await run(`embedContent ${embeddingModel}`, () =>
    ai.models.embedContent({
      model: embeddingModel,
      contents: 'preflight',
      config: { outputDimensionality: 1536, taskType: 'RETRIEVAL_DOCUMENT' },
    }),
  );
  return checks;
}

function writePreflightReport(runDir: string, checks: Check[]) {
  const failed = checks.filter((check) => !check.ok);
  const kind = failed[0]?.kind;
  const lines = [
    '# 00 Preflight (third-party check)',
    '',
    `Result: ${failed.length === 0 ? 'OK' : `FAILED, classification ${kind}`}`,
    '',
    '| Check | Result | Time |',
    '|---|---|---|',
    ...checks.map((check) => `| ${check.name} | ${check.ok ? 'ok' : `FAILED (${check.kind})`} | ${check.ms} ms |`),
  ];
  for (const check of failed) {
    lines.push('', `## ${check.name}`, '', `Classification: ${check.kind}`, '', '```', excerpt(check.detail ?? '', 2000), '```');
  }
  if (failed.length > 0) {
    lines.push(
      '',
      '## What to do',
      '',
      'No flow ran and no further call was made. Verify the Gemini key / quota / model in Google AI Studio, then re-run.',
      kind === 'THIRD_PARTY_AUTH' ? 'The key in server/.env (GEMINI_API_KEY) is rejected or lacks permission.' : '',
      kind === 'THIRD_PARTY_QUOTA' ? 'The key is rate limited or out of quota (429 / RESOURCE_EXHAUSTED).' : '',
      kind === 'THIRD_PARTY_MODEL' ? `The model "${CHAT_MODEL}" (or the embedding model) is not available to this key.` : '',
    );
  }
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, '00-preflight.md'), redact(lines.join('\n')) + '\n');
  return failed;
}

export default async function setup(project: TestProject) {
  const env = project.config.env as Record<string, string>;
  const url = new URL(env.DATABASE_URL);
  const database = url.pathname.slice(1);
  // The database is dropped on every run: never anything but a *_e2e database
  if (!database.endsWith('_e2e')) {
    throw new Error(`Refusing to run e2e tests on database "${database}"`);
  }
  const runDir = env.E2E_RUN_DIR;
  mkdirSync(runDir, { recursive: true });

  // Redis first: it is the cheapest check
  const redis = new Redis({
    host: env.REDIS_HOST,
    port: Number(env.REDIS_PORT),
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  try {
    await redis.connect();
    await redis.ping();
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `${QUEUE_PREFIX}:*`, 'COUNT', 500);
      cursor = next;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== '0');
  } catch (error) {
    throw new Error(
      `Redis is not reachable at ${env.REDIS_HOST}:${env.REDIS_PORT}. Run \`docker compose up -d\` in server/ first. (${(error as Error).message})`,
    );
  } finally {
    redis.disconnect();
  }

  // Third parties before any database work: a bad key stops the run here and spends nothing more
  const failed = writePreflightReport(runDir, await preflight(env));
  if (failed.length > 0) {
    throw new Error(
      `Third-party preflight failed (${failed[0].kind}). No flow ran. See ${join(runDir, '00-preflight.md')}`,
    );
  }

  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.href });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${database}"`);
  } finally {
    await admin.end();
  }

  // npx may hit the wrapper: use the local binary
  const bin = resolve(__dirname, '../../node_modules/.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma');
  execSync(`"${bin}" migrate deploy`, { env: { ...process.env, ...env, DATABASE_URL: url.href }, stdio: 'pipe' });

  const email = 'e2e-master@e2e.local';
  const password = randomBytes(18).toString('base64url');
  const pool = new pg.Pool({ connectionString: url.href });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    await seedCharacters(prisma);
    await prisma.user.create({ data: { email, passwordHash: await bcrypt.hash(password, 10) } });
  } finally {
    await prisma.$disconnect();
  }

  project.provide('e2eUser', { email, password });
}
