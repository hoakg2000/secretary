import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { excerpt } from './redact';

export type ThirdPartyKind =
  | 'THIRD_PARTY_AUTH'
  | 'THIRD_PARTY_QUOTA'
  | 'THIRD_PARTY_MODEL'
  | 'THIRD_PARTY_OTHER';
export type FailureKind = ThirdPartyKind | 'APP_ERROR' | 'ASSERTION' | 'TEST_ERROR' | 'BLOCKED';

/** Folder of this run (set by vitest.config.e2e.ts) */
export const runDir = () => {
  const dir = process.env.E2E_RUN_DIR;
  if (!dir) throw new Error('E2E_RUN_DIR is not set: run the suite with `npm run test:e2e`');
  return dir;
};

const statusCode = (text: string): number | null => {
  const match =
    /"code"\s*:\s*(\d{3})/.exec(text) ?? /MotAPI lỗi (\d{3})/.exec(text) ?? /got status:?\s*(\d{3})/i.exec(text) ?? /"status"\s*:\s*(\d{3})/.exec(text);
  return match ? Number(match[1]) : null;
};

/**
 * Maps a provider (Gemini or MộtAPI) error text to THIRD_PARTY_*; null when the text carries no provider signature.
 * Only call it on error texts (SSE error frames, 5xx bodies, server error logs), never on normal replies.
 */
export function classifyThirdParty(text: string): ThirdPartyKind | null {
  const code = statusCode(text);
  if (/RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(text) || code === 429) return 'THIRD_PARTY_QUOTA';
  if (
    /API key not valid|API_KEY_INVALID|API key expired|UNAUTHENTICATED|PERMISSION_DENIED|API key.*(leaked|suspended)/i.test(
      text,
    ) ||
    code === 401 ||
    code === 403
  ) {
    return 'THIRD_PARTY_AUTH';
  }
  if (
    /models\/[\w.-]+ is not found|model.{0,60}(not found|is not supported)|is not supported for (generateContent|embedContent)/i.test(
      text,
    ) ||
    (code === 404 && /model/i.test(text))
  ) {
    return 'THIRD_PARTY_MODEL';
  }
  if (
    /UNAVAILABLE|overloaded|DEADLINE_EXCEEDED|fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|generativelanguage\.googleapis|motapis\.com/i.test(
      text,
    ) ||
    (code !== null && code >= 500)
  ) {
    return 'THIRD_PARTY_OTHER';
  }
  return null;
}

const stopFile = () => join(runDir(), 'STOP');

export function writeStop(kind: ThirdPartyKind, source: string, text: string) {
  mkdirSync(runDir(), { recursive: true });
  writeFileSync(stopFile(), JSON.stringify({ kind, source, detail: excerpt(text, 1500) }, null, 2));
}

/** Throws when an earlier step found a third-party failure: no more calls are spent */
export function assertNotStopped() {
  if (!existsSync(stopFile())) return;
  const { kind, source } = JSON.parse(readFileSync(stopFile(), 'utf8')) as {
    kind: ThirdPartyKind;
    source: string;
  };
  throw new Error(`[BLOCKED] blocked by third-party failure (${kind} at ${source}), see report in ${runDir()}`);
}

/** When the text is a provider failure: writes the STOP marker and throws a tagged error */
export function stopIfThirdParty(source: string, text: string) {
  const kind = classifyThirdParty(text);
  if (!kind) return;
  writeStop(kind, source, text);
  throw new Error(`[${kind}] ${source}: ${excerpt(text, 600)}`);
}
