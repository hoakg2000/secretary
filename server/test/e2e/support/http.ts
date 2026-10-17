import { beforeEach, afterEach, inject } from 'vitest';
import { serverErrorsSince } from './app';
import { stopIfThirdParty } from './classify';
import { excerpt } from './redact';

export type Frame = { type: string } & Record<string, any>;

export type Step =
  | { kind: 'http'; method: string; path: string; status: number; request?: string; response: string; ms: number }
  | { kind: 'sse'; path: string; status: number; request: string; frames: string[]; ms: number }
  | { kind: 'note'; text: string };

type TaskLike = { meta: Record<string, any> };

let current: TaskLike | undefined;
let baseUrl = '';

/** Call once per spec file: each test then records its requests, responses and SSE frames on task.meta.steps */
export function trackSteps() {
  beforeEach(({ task }) => {
    current = task as unknown as TaskLike;
    (task.meta as Record<string, unknown>).steps = [];
  });
  afterEach(() => {
    current = undefined;
  });
}

export const setBaseUrl = (url: string) => {
  baseUrl = url;
};

const record = (step: Step) => {
  if (current) (current.meta.steps as Step[]).push(step);
};

export const note = (text: string) => record({ kind: 'note', text: excerpt(text, 500) });

const parseJson = (raw: string) => {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

export interface ApiOptions {
  token?: string;
  body?: unknown;
  /** Polling calls: skip recording */
  quiet?: boolean;
}

/** One real HTTP call. Returns the status and the parsed body; a 5xx with a provider signature stops the run */
export async function api<T = any>(method: string, path: string, { token, body, quiet }: ApiOptions = {}) {
  const started = Date.now();
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const raw = await response.text();
  if (!quiet) {
    record({
      kind: 'http',
      method,
      path,
      status: response.status,
      request: body === undefined ? undefined : excerpt(body, 1000),
      response: excerpt(raw),
      ms: Date.now() - started,
    });
  }
  if (response.status >= 500) stopIfThirdParty(`${method} ${path}`, `${raw}\n${serverErrorsSince(started)}`);
  return { status: response.status, body: parseJson(raw) as T };
}

export async function login(email: string, password: string): Promise<string> {
  // the password is never recorded: redact() masks the field, and the body is not echoed on failure
  const { status, body } = await api('POST', '/auth/login', { body: { email, password } });
  if (status !== 200) throw new Error(`login failed with HTTP ${status}`);
  return body.data.accessToken as string;
}

/** The e2e master user created by global-setup */
export const e2eUser = () => inject('e2eUser');

export interface ChatResult {
  status: number;
  frames: Frame[];
  sessionId?: string;
  /** All `text` frames joined: the Vietnamese reply as shown on screen */
  text: string;
  reply?: Frame;
  errors: Frame[];
  ofType: (type: string) => Frame[];
}

/** POST /ai-agent/chat/stream: reads the whole SSE stream into frames. A provider error frame stops the run */
export async function chat(token: string, body: { message: string; characterId?: string; sessionId?: string }) {
  const started = Date.now();
  const response = await fetch(`${baseUrl}/ai-agent/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(150_000),
  });

  const frames: Frame[] = [];
  let raw = '';
  if (response.status === 200 && response.body) {
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = block
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('');
        if (data) frames.push(parseJson(data) as Frame);
      }
    }
  } else {
    raw = await response.text();
  }

  // text frames are token chunks: show them joined to keep the report readable
  const shown: string[] = [];
  let pending = '';
  for (const frame of frames) {
    if (frame.type === 'text') {
      pending += String(frame.content ?? '');
      continue;
    }
    if (pending) {
      shown.push(`text: ${pending}`);
      pending = '';
    }
    shown.push(JSON.stringify(frame));
  }
  if (pending) shown.push(`text: ${pending}`);
  record({
    kind: 'sse',
    path: '/ai-agent/chat/stream',
    status: response.status,
    request: excerpt(body, 1000),
    frames: raw ? [excerpt(raw)] : shown.map((line) => excerpt(line, 1500)),
    ms: Date.now() - started,
  });

  const errors = frames.filter((frame) => frame.type === 'error');
  for (const error of errors) stopIfThirdParty('chat stream error frame', String(error.message ?? ''));
  if (response.status >= 500) stopIfThirdParty('chat stream', raw);

  const result: ChatResult = {
    status: response.status,
    frames,
    sessionId: frames.find((frame) => frame.type === 'session')?.sessionId,
    text: frames
      .filter((frame) => frame.type === 'text')
      .map((frame) => String(frame.content ?? ''))
      .join(''),
    reply: frames.find((frame) => frame.type === 'reply'),
    errors,
    ofType: (type) => frames.filter((frame) => frame.type === type),
  };
  return result;
}

/** Polls `fn` until it returns a value other than undefined/null/false; throws with the last error on timeout */
export async function waitFor<T>(
  fn: () => Promise<T | undefined | null | false> | T | undefined | null | false,
  { timeout = 30_000, interval = 1_000, label = 'condition' } = {},
): Promise<T> {
  const deadline = Date.now() + timeout;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value !== undefined && value !== null && value !== false) return value;
    } catch (error) {
      // a tagged third-party stop must not be retried
      if (/^\[(THIRD_PARTY|BLOCKED)/.test((error as Error).message)) throw error;
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(
    `timed out after ${timeout} ms waiting for ${label}${lastError ? ` (last error: ${(lastError as Error).message})` : ''}`,
  );
}
