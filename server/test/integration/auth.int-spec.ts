import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { google } from 'googleapis';
import { createHash, randomUUID } from 'node:crypto';
import { AuthService } from '../../src/auth/auth.service';
import { GoogleClientFactory } from '../../src/auth/google-client.factory';
import { createTestModule, resetDb, seedUser, TestContext } from './harness';

const PASSWORD = 'correct horse';
const sha256 = (token: string) => createHash('sha256').update(token).digest('hex');

describe('AuthService (integration)', () => {
  let ctx: TestContext;
  let auth: AuthService;
  let jwt: JwtService;
  let passwordHash: string;

  beforeAll(async () => {
    ctx = await createTestModule();
    auth = ctx.moduleRef.get(AuthService);
    jwt = ctx.moduleRef.get(JwtService);
    passwordHash = await bcrypt.hash(PASSWORD, 4);
  });
  beforeEach(() => resetDb(ctx.prisma));
  afterAll(() => ctx.moduleRef.close());

  const seedLogin = async () => {
    const user = await seedUser(ctx.prisma, { passwordHash });
    const login = await auth.login({ email: user.email, password: PASSWORD });
    const session = await ctx.prisma.userSession.findFirstOrThrow({ where: { userId: user.id } });
    return { ...login, user, session };
  };

  const expectUnauthorized = (token: string) =>
    expect(auth.refreshAccessToken(token)).rejects.toBeInstanceOf(UnauthorizedException);

  it('login stores one session and the SHA-256 of the refresh token', async () => {
    const { user, refreshToken } = await seedLogin();

    const sessions = await ctx.prisma.userSession.findMany();
    const tokens = await ctx.prisma.refreshToken.findMany();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].userId).toBe(user.id);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      userId: user.id,
      sessionId: sessions[0].id,
      isRevoked: false,
      tokenHash: sha256(refreshToken),
    });
    expect(tokens[0].tokenHash).not.toBe(refreshToken);
    expect(tokens[0].expiresAt.getTime()).toBe(jwt.decode(refreshToken).exp * 1000);
  });

  it('login rejects wrong password, unknown email, inactive user and user without password', async () => {
    const user = await seedUser(ctx.prisma, { passwordHash });
    const inactive = await seedUser(ctx.prisma, { passwordHash, isActive: false });
    const noPassword = await seedUser(ctx.prisma);

    for (const dto of [
      { email: user.email, password: 'wrong' },
      { email: 'nobody@test.local', password: PASSWORD },
      { email: inactive.email, password: PASSWORD },
      { email: noPassword.email, password: PASSWORD },
    ]) {
      await expect(auth.login(dto)).rejects.toBeInstanceOf(UnauthorizedException);
    }

    expect(await ctx.prisma.userSession.count()).toBe(0);
    expect(await ctx.prisma.refreshToken.count()).toBe(0);
  });

  it('refreshAccessToken revokes the old token and issues a successor on the same session', async () => {
    const { session, refreshToken } = await seedLogin();

    const refreshed = await auth.refreshAccessToken(refreshToken);

    const tokens = await ctx.prisma.refreshToken.findMany();
    expect(tokens).toHaveLength(2);
    expect(tokens.find((t) => t.tokenHash === sha256(refreshToken))).toMatchObject({
      isRevoked: true,
      sessionId: session.id,
    });
    expect(tokens.find((t) => t.tokenHash === sha256(refreshed.refreshToken))).toMatchObject({
      isRevoked: false,
      sessionId: session.id,
    });
    expect(jwt.verify(refreshed.accessToken)).toMatchObject({ sessionId: session.id, typ: 'access' });
  });

  it('replay of a rotated token destroys the session and all its refresh tokens', async () => {
    const { refreshToken } = await seedLogin();
    await auth.refreshAccessToken(refreshToken);

    await expectUnauthorized(refreshToken);

    expect(await ctx.prisma.userSession.count()).toBe(0);
    expect(await ctx.prisma.refreshToken.count()).toBe(0);
  });

  it('rejects an expired row, a deleted session, an inactive user and an access token', async () => {
    const expired = await seedLogin();
    await ctx.prisma.refreshToken.updateMany({
      where: { sessionId: expired.session.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expectUnauthorized(expired.refreshToken);

    const deleted = await seedLogin();
    await ctx.prisma.userSession.delete({ where: { id: deleted.session.id } });
    await expectUnauthorized(deleted.refreshToken);

    const inactive = await seedLogin();
    await ctx.prisma.user.update({ where: { id: inactive.user.id }, data: { isActive: false } });
    await expectUnauthorized(inactive.refreshToken);

    const active = await seedLogin();
    await expectUnauthorized(active.accessToken);

    // No rejected attempt issued or revoked a token
    expect(await ctx.prisma.refreshToken.count()).toBe(3);
    expect(await ctx.prisma.refreshToken.count({ where: { isRevoked: true } })).toBe(0);
  });

  it('two concurrent refreshes of the same token issue exactly one successor', async () => {
    const { session, refreshToken } = await seedLogin();

    await Promise.allSettled([
      auth.refreshAccessToken(refreshToken),
      auth.refreshAccessToken(refreshToken),
    ]);

    const tokens = await ctx.prisma.refreshToken.findMany({ where: { sessionId: session.id } });
    expect(tokens.map((t) => t.isRevoked).sort()).toEqual([false, true]);
  });

  it('logout deletes the session and its tokens, never a session of another user', async () => {
    const mine = await seedLogin();
    const other = await seedLogin();

    await auth.logout(mine.user.id, other.session.id);
    expect(await ctx.prisma.userSession.count()).toBe(2);

    await auth.logout(mine.user.id, mine.session.id);

    expect((await ctx.prisma.userSession.findMany()).map((s) => s.id)).toEqual([other.session.id]);
    expect((await ctx.prisma.refreshToken.findMany()).map((t) => t.sessionId)).toEqual([
      other.session.id,
    ]);
  });

  it('getActiveSession bumps lastActiveAt and rejects another user', async () => {
    const { user, session } = await seedLogin();
    const past = new Date(Date.now() - 60 * 60 * 1000);
    await ctx.prisma.userSession.update({ where: { id: session.id }, data: { lastActiveAt: past } });

    await expect(auth.getActiveSession(randomUUID(), session.id)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await auth.getActiveSession(user.id, session.id);

    const stored = await ctx.prisma.userSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(stored.lastActiveAt.getTime()).toBeGreaterThan(past.getTime());
  });

  it('handleGoogleCallback stores the Google tokens encrypted and forUser decrypts them', async () => {
    const user = await seedUser(ctx.prisma);
    const expiry = Date.now() + 3600 * 1000;
    const getToken = vi.spyOn(google.auth.OAuth2.prototype, 'getToken').mockResolvedValue({
      tokens: { access_token: 'plain-access', refresh_token: 'plain-refresh', expiry_date: expiry },
    } as never);

    await expect(auth.handleGoogleCallback('code', 'not-a-jwt')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      auth.handleGoogleCallback('code', jwt.sign({ sub: user.id, typ: 'access' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(getToken).not.toHaveBeenCalled();
    expect(await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      googleAccessToken: null,
      googleRefreshToken: null,
    });

    await auth.handleGoogleCallback('code', jwt.sign({ sub: user.id, typ: 'oauth_state' }));

    const stored = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.googleAccessToken).toMatch(/^v1:/);
    expect(stored.googleAccessToken).not.toContain('plain-access');
    expect(stored.googleRefreshToken).not.toContain('plain-refresh');
    expect(stored.googleTokenExpiresAt?.getTime()).toBe(expiry);

    const client = await ctx.moduleRef.get(GoogleClientFactory).forUser(user.id);
    expect(client?.credentials).toMatchObject({
      access_token: 'plain-access',
      refresh_token: 'plain-refresh',
      expiry_date: expiry,
    });
  });
});
