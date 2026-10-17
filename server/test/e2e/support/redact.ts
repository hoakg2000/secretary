import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';

const SECRET_KEY = /KEY|SECRET|TOKEN|PASSWORD|DATABASE_URL|CLIENT_ID|EMAIL/i;

let cached: string[] | undefined;

/** Values of server/.env that look like secrets, plus the shell override of the Gemini key; longest first */
function secretValues(): string[] {
  if (cached) return cached;
  const values = new Set<string>();
  try {
    const env = parse(readFileSync(resolve(__dirname, '../../../.env')));
    for (const [key, value] of Object.entries(env)) {
      if (SECRET_KEY.test(key) && value.length >= 6) values.add(value);
    }
  } catch {
    // no .env: nothing to mask by value, the patterns below still apply
  }
  for (const key of ['GEMINI_API_KEY', 'E2E_GEMINI_API_KEY_OVERRIDE']) {
    const value = process.env[key];
    if (value && value.length >= 6) values.add(value);
  }
  cached = [...values].sort((a, b) => b.length - a.length);
  return cached;
}

const PATTERNS: [RegExp, string][] = [
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [REDACTED]'],
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, '[JWT]'],
  [/\b(key|api_key|apikey|access_token|token)=[^&\s"']+/gi, '$1=[REDACTED]'],
  [/(x-goog-api-key|authorization|set-cookie|cookie)(["']?\s*[:=]\s*["']?)[^\n"']+/gi, '$1$2[REDACTED]'],
  [
    /("(?:password|accessToken|refreshToken|access_token|refresh_token)"\s*:\s*)"[^"]*"/g,
    '$1"[REDACTED]"',
  ],
  [/\bAIza[0-9A-Za-z_-]{20,}/g, '[REDACTED]'],
  [/\bsk-[A-Za-z0-9_-]{8,}/g, '[REDACTED]'],
  [/GOCSPX-[\w-]+/g, '[REDACTED]'],
];

/** Masks every secret value from .env, Bearer tokens, JWTs, `key=` query params, cookies and password fields */
export function redact(text: string): string {
  let out = text;
  for (const value of secretValues()) out = out.split(value).join('[REDACTED]');
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

export function excerpt(value: unknown, max = 2000): string {
  const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
  const clipped = text.length > max ? `${text.slice(0, max)}... [+${text.length - max} chars]` : text;
  return redact(clipped);
}
