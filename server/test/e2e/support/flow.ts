import { afterAll, beforeAll } from 'vitest';
import { startApp, type RunningApp } from './app';
import { assertNotStopped } from './classify';
import { e2eUser, login, setBaseUrl, trackSteps } from './http';

/**
 * Shared setup of a flow file: refuses to run after a third-party stop, boots the real app on a random port,
 * logs in as the e2e user and records every call on the running test.
 */
export function bootFlow() {
  const ctx = {} as { app: RunningApp; token: string };
  trackSteps();
  beforeAll(async () => {
    assertNotStopped();
    ctx.app = await startApp();
    setBaseUrl(ctx.app.baseUrl);
    const { email, password } = e2eUser();
    ctx.token = await login(email, password);
  });
  afterAll(() => ctx.app?.close());
  return ctx;
}

/** A step that needs the result of an earlier step: fails fast, without spending a call, when that step failed */
export function need<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Error(`prerequisite missing: ${what} (an earlier step failed)`);
  return value;
}
