import { randomBytes } from 'node:crypto';
import { decryptToken, encryptToken } from './token-cipher';

const key = randomBytes(32).toString('base64');

describe('token-cipher', () => {
  it('round-trips', () => {
    const blob = encryptToken('ya29.secret-token', key);
    expect(blob.startsWith('v1:')).toBe(true);
    expect(blob).not.toContain('ya29');
    expect(decryptToken(blob, key)).toBe('ya29.secret-token');
  });

  it('throws on a tampered blob', () => {
    const parts = encryptToken('token', key).split(':');
    parts[3] = Buffer.from('other').toString('base64');
    expect(() => decryptToken(parts.join(':'), key)).toThrow();
  });

  it('throws on plaintext and on a wrong-size key', () => {
    expect(() => decryptToken('ya29.plaintext', key)).toThrow();
    expect(() => encryptToken('x', 'c2hvcnQ=')).toThrow(/32 bytes/);
  });
});
