import 'reflect-metadata';
import { validate } from './env.validation';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',
};

describe('env validation', () => {
  it('accepts a minimal config, converts numbers and applies defaults', () => {
    const env = validate(base);
    expect(env.REDIS_PORT).toBe(6379);
    expect(env.PORT).toBe(3000);
    expect(env.JWT_REFRESH_EXPIRES_IN).toBe('7d');
  });

  it('names the missing key', () => {
    const { JWT_SECRET: _omit, ...rest } = base;
    expect(() => validate(rest)).toThrow(/JWT_SECRET/);
  });

  it('requires TOKEN_ENCRYPTION_KEY only when Google OAuth is configured', () => {
    expect(() => validate({ ...base, GOOGLE_CLIENT_ID: 'id' })).toThrow(
      /TOKEN_ENCRYPTION_KEY/,
    );
    const key = Buffer.alloc(32, 1).toString('base64');
    expect(() =>
      validate({ ...base, GOOGLE_CLIENT_ID: 'id', TOKEN_ENCRYPTION_KEY: key }),
    ).not.toThrow();
  });

  it('rejects a short secret', () => {
    expect(() => validate({ ...base, JWT_REFRESH_SECRET: 'short' })).toThrow(
      /JWT_REFRESH_SECRET/,
    );
  });
});
