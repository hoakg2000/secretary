import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';

function toKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded');
  }
  return key;
}

/** AES-256-GCM. Output: v1:<iv>:<tag>:<ciphertext>, each part base64. */
export function encryptToken(plain: string, keyBase64: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', toKey(keyBase64), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64')))
    .join(':');
}

export function decryptToken(blob: string, keyBase64: string): string {
  const [version, iv, tag, ciphertext] = blob.split(':');
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
    throw new Error('Unrecognised encrypted token format');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    toKey(keyBase64),
    Buffer.from(iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
