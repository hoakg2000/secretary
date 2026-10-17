import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/integration/**/*.int-spec.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    globalSetup: './test/integration/global-setup.ts',
    // Every variable the app reads is set here so nothing falls through to server/.env (real keys)
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'postgresql://secretary_user:secretary_password@localhost:5432/secretary_test',
      JWT_SECRET: 'integration-test-jwt-secret-0123456789',
      JWT_REFRESH_SECRET: 'integration-test-refresh-secret-0123456789',
      JWT_EXPIRES_IN: '15m',
      JWT_REFRESH_EXPIRES_IN: '7d',
      REDIS_HOST: 'localhost',
      REDIS_PORT: '6379',
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
      TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
      GEMINI_API_KEY: 'test',
      FISH_AUDIO_API_KEY: 'test',
      TELEGRAM_BOT_TOKEN: 'test',
      TELEGRAM_CHAT_ID: 'test',
      APP_TIMEZONE: 'Asia/Ho_Chi_Minh',
      GMAIL_PUBSUB_TOPIC: 'projects/test/topics/gmail',
      GOOGLE_REDIRECT_URI: 'http://localhost:3000/auth/google/callback',
      GEMINI_EMBEDDING_MODEL: 'test-embedding-model',
      CLIENT_URL: 'http://localhost:3000',
      NODE_ENV: 'test',
      PUBSUB_PUSH_AUDIENCE: 'https://test.local/email/gmail/push',
      PUBSUB_PUSH_SERVICE_ACCOUNT: 'pubsub-push@test.iam.gserviceaccount.com',
      BULLMQ_CONCURRENCY: '1',
      // cron jobs are never started by the harness; a rare 6-field value (1 Jan 03:00) is a second guard
      CALENDAR_SYNC_CRON: '0 0 3 1 1 *',
    },
  },
});
