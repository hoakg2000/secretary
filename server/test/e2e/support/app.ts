import type { AddressInfo } from 'node:net';
import type { LoggerService } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../../../src/app.module';
import { configureApp } from '../../../src/app.setup';
import { redact } from './redact';

/** Warnings and errors the server logged during this run, kept to explain failures (e.g. a FAILED email) */
const serverErrors: { at: number; text: string }[] = [];

const text = (message: unknown, rest: unknown[]) =>
  redact([message, ...rest].map((part) => (part instanceof Error ? (part.stack ?? part.message) : String(part))).join(' '));

const captureLogger: LoggerService = {
  log: () => undefined,
  debug: () => undefined,
  verbose: () => undefined,
  warn: (message, ...rest) => void serverErrors.push({ at: Date.now(), text: `WARN ${text(message, rest)}` }),
  error: (message, ...rest) => void serverErrors.push({ at: Date.now(), text: `ERROR ${text(message, rest)}` }),
};

/** Server warnings/errors logged since `since` (epoch ms) */
export function serverErrorsSince(since = 0): string {
  return serverErrors
    .filter((entry) => entry.at >= since)
    .map((entry) => entry.text)
    .join('\n');
}

/** The real AppModule (real worker, crons, tool discovery, Gemini) behind the same HTTP config as main.ts, on a random port */
export async function startApp() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: captureLogger });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}/api/v1`, close: () => app.close() };
}

export type RunningApp = Awaited<ReturnType<typeof startApp>>;
