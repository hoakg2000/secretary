import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Real-flow suite: real Gemini, real HTTP. Costs tokens: run on demand with `npm run test:e2e`.
const pad = (n: number) => String(n).padStart(2, '0');
const now = new Date();
const runId =
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
  `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

// The real server/.env is read with dotenv `parse` only; nothing is written to process.env here
const dotenv = parse(readFileSync(resolve(__dirname, '.env')));

// Dedicated database: same server and credentials as DATABASE_URL, database name secretary_e2e
const databaseUrl = new URL(dotenv.DATABASE_URL);
databaseUrl.pathname = '/secretary_e2e';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/e2e/**/*.e2e-spec.ts'],
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 120_000,
    globalSetup: './test/e2e/global-setup.ts',
    reporters: ['default', './test/e2e/support/failure-reporter.ts'],
    env: {
      ...dotenv,
      // Stop-path check without spending tokens: E2E_GEMINI_API_KEY_OVERRIDE=invalid npm run test:e2e
      ...(process.env.E2E_GEMINI_API_KEY_OVERRIDE
        ? { GEMINI_API_KEY: process.env.E2E_GEMINI_API_KEY_OVERRIDE }
        : {}),
      DATABASE_URL: databaseUrl.href,
      // A dev worker on the same Redis never sees e2e jobs
      BULLMQ_PREFIX: 'secretary-e2e',
      NODE_ENV: 'test',
      // 1 Jan 03:00: never fires during a run
      CALENDAR_SYNC_CRON: '0 0 3 1 1 *',
      // Nothing is sent outside: no Telegram, no Gmail Pub/Sub, no Fish.audio
      TELEGRAM_BOT_TOKEN: '',
      TELEGRAM_CHAT_ID: '',
      GMAIL_PUBSUB_TOPIC: '',
      PUBSUB_PUSH_AUDIENCE: '',
      PUBSUB_PUSH_SERVICE_ACCOUNT: '',
      FISH_AUDIO_API_KEY: '',
      E2E_RUN_DIR: resolve(__dirname, 'test/e2e/reports', runId),
    },
  },
});
