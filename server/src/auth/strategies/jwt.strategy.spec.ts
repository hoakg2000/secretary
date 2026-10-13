import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

const session = { userId: 'u1', user: { isActive: true } };

function build(found: unknown) {
  const prisma = { userSession: { findUnique: vi.fn().mockResolvedValue(found) } };
  const config = { getOrThrow: () => 'x'.repeat(32) };
  return new JwtStrategy(config as any, prisma as any);
}

const payload = { sub: 'u1', email: 'a@b.c', sessionId: 's1', typ: 'access' as const };

describe('JwtStrategy.validate', () => {
  it('accepts an access token with a live session', async () => {
    await expect(build(session).validate(payload)).resolves.toEqual({
      userId: 'u1',
      email: 'a@b.c',
      sessionId: 's1',
    });
  });

  it('rejects a refresh token used as a bearer token', async () => {
    await expect(
      build(session).validate({ ...payload, typ: 'refresh' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when the session is gone (logged out)', async () => {
    await expect(build(null).validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a session owned by another user or an inactive user', async () => {
    await expect(
      build({ ...session, userId: 'u2' }).validate(payload),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      build({ userId: 'u1', user: { isActive: false } }).validate(payload),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
