import { createHash } from 'node:crypto';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';
import { GoogleClientFactory } from '../../src/auth/google-client.factory';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy';
import {
  MISSING,
  createTestModule,
  expectRejection,
  rejection,
  resetState,
  seedGoogleUser,
  seedUser,
  type TestContext,
} from './harness';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const PASSWORD = 'correct-horse';

describe('auth integration', () => {
  let ctx: TestContext;
  let auth: AuthService;
  let factory: GoogleClientFactory;
  let strategy: JwtStrategy;
  let jwt: JwtService;

  beforeAll(async () => {
    ctx = await createTestModule();
    auth = ctx.moduleRef.get(AuthService);
    factory = ctx.moduleRef.get(GoogleClientFactory);
    strategy = ctx.moduleRef.get(JwtStrategy, { strict: false });
    jwt = ctx.moduleRef.get(JwtService, { strict: false });
  });

  afterAll(() => ctx.close());

  beforeEach(() => resetState(ctx));

  const seedLoginUser = async (data: Record<string, unknown> = {}) =>
    seedUser(ctx.prisma, { passwordHash: await bcrypt.hash(PASSWORD, 4), ...data });

  const loginAs = (user: { email: string }) => auth.login({ email: user.email, password: PASSWORD });

  describe('login', () => {
    it('creates a session and stores only the SHA-256 of the refresh token', async () => {
      const user = await seedLoginUser();

      const result = await auth.login({ email: user.email, password: PASSWORD }, 'jest-agent', '10.0.0.1');

      expect(result.user).toEqual({ id: user.id, email: user.email });
      const sessions = await ctx.prisma.userSession.findMany();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({ userId: user.id, userAgent: 'jest-agent', ipAddress: '10.0.0.1' });
      const tokens = await ctx.prisma.refreshToken.findMany();
      expect(tokens).toHaveLength(1);
      expect(tokens[0].tokenHash).toBe(sha256(result.refreshToken));
      expect(tokens[0].tokenHash).not.toBe(result.refreshToken);
      expect(tokens[0]).toMatchObject({ sessionId: sessions[0].id, userId: user.id, isRevoked: false });
      expect(tokens[0].expiresAt.getTime()).toBe(result.refreshExpiresAt.getTime());
    });

    it('issues an access token carrying user, session and access type', async () => {
      const user = await seedLoginUser();

      const { accessToken } = await loginAs(user);

      const session = await ctx.prisma.userSession.findFirstOrThrow();
      expect(jwt.verify(accessToken)).toMatchObject({
        sub: user.id,
        email: user.email,
        sessionId: session.id,
        typ: 'access',
      });
    });

    it('falls back to default user agent and ip', async () => {
      const user = await seedLoginUser();

      await loginAs(user);

      expect(await ctx.prisma.userSession.findFirstOrThrow()).toMatchObject({
        userAgent: 'Unknown',
        ipAddress: '127.0.0.1',
      });
    });

    it('rejects a wrong password and creates no session', async () => {
      const user = await seedLoginUser();

      await expect(auth.login({ email: user.email, password: 'nope' })).rejects.toThrow(UnauthorizedException);

      expect(await ctx.prisma.userSession.count()).toBe(0);
      expect(await ctx.prisma.refreshToken.count()).toBe(0);
    });

    it('rejects an unknown email with the same message as a wrong password', async () => {
      const user = await seedLoginUser();
      const wrongPassword = await auth.login({ email: user.email, password: 'nope' }).catch((e) => e);
      const unknownEmail = await auth.login({ email: 'ghost@test.local', password: PASSWORD }).catch((e) => e);

      expect(unknownEmail).toBeInstanceOf(UnauthorizedException);
      expect(unknownEmail.message).toBe(wrongPassword.message);
    });

    it('rejects an inactive user even with the right password', async () => {
      const user = await seedLoginUser({ isActive: false });

      await expect(loginAs(user)).rejects.toThrow(UnauthorizedException);

      expect(await ctx.prisma.userSession.count()).toBe(0);
    });

    it('rejects a user without a password hash (Google-only account)', async () => {
      const user = await seedUser(ctx.prisma);

      await expect(auth.login({ email: user.email, password: PASSWORD })).rejects.toThrow(UnauthorizedException);
    });

    it('gives each login its own session and distinct tokens', async () => {
      const user = await seedLoginUser();

      const a = await loginAs(user);
      const b = await loginAs(user);

      expect(a.refreshToken).not.toBe(b.refreshToken);
      expect(await ctx.prisma.userSession.count()).toBe(2);
      expect(await ctx.prisma.refreshToken.count()).toBe(2);
    });
  });

  describe('refreshAccessToken', () => {
    it('rejects a missing token', async () => {
      await expectRejection(auth.refreshAccessToken(undefined), UnauthorizedException, 'Refresh Token không tồn tại');
    });

    it('rejects a malformed token', async () => {
      await expect(auth.refreshAccessToken('garbage')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an access token presented as a refresh token', async () => {
      const user = await seedLoginUser();
      const { accessToken } = await loginAs(user);

      await expect(auth.refreshAccessToken(accessToken)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a refresh-secret token with the wrong type', async () => {
      const user = await seedLoginUser();
      const session = await ctx.prisma.userSession.create({ data: { userId: user.id } });
      const token = jwt.sign(
        { sub: user.id, sessionId: session.id, typ: 'access' },
        { secret: process.env.JWT_REFRESH_SECRET },
      );

      await expectRejection(auth.refreshAccessToken(token), UnauthorizedException, 'Refresh Token không hợp lệ');
    });

    it('rejects a validly signed token that is not stored', async () => {
      const user = await seedLoginUser();
      const session = await ctx.prisma.userSession.create({ data: { userId: user.id } });
      const token = jwt.sign(
        { sub: user.id, sessionId: session.id, typ: 'refresh' },
        { secret: process.env.JWT_REFRESH_SECRET, expiresIn: '1h' },
      );

      await expectRejection(auth.refreshAccessToken(token), UnauthorizedException, 'đã bị thu hồi hoặc hết hạn');
    });

    it('rejects a stored token whose DB expiry has passed', async () => {
      const user = await seedLoginUser();
      const { refreshToken } = await loginAs(user);
      await ctx.prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

      await expectRejection(auth.refreshAccessToken(refreshToken), UnauthorizedException, 'đã bị thu hồi hoặc hết hạn');
    });

    it('rotates: revokes the old token and stores a hashed successor in the same session', async () => {
      const user = await seedLoginUser();
      const login = await loginAs(user);

      const result = await auth.refreshAccessToken(login.refreshToken);

      expect(result.refreshToken).not.toBe(login.refreshToken);
      const rows = await ctx.prisma.refreshToken.findMany();
      expect(rows).toHaveLength(2);
      const old = rows.find((r) => r.tokenHash === sha256(login.refreshToken))!;
      const next = rows.find((r) => r.tokenHash === sha256(result.refreshToken))!;
      expect(old.isRevoked).toBe(true);
      expect(next).toMatchObject({ isRevoked: false, sessionId: old.sessionId, userId: user.id });
      expect(jwt.verify(result.accessToken)).toMatchObject({
        sub: user.id,
        sessionId: old.sessionId,
        typ: 'access',
      });
    });

    it('lets the successor token be rotated again', async () => {
      const user = await seedLoginUser();
      const login = await loginAs(user);
      const first = await auth.refreshAccessToken(login.refreshToken);

      const second = await auth.refreshAccessToken(first.refreshToken);

      expect(second.refreshToken).not.toBe(first.refreshToken);
      expect(await ctx.prisma.refreshToken.count({ where: { isRevoked: false } })).toBe(1);
    });

    it('ends the whole session when a revoked token is reused', async () => {
      const user = await seedLoginUser();
      const login = await loginAs(user);
      const rotated = await auth.refreshAccessToken(login.refreshToken);

      await expectRejection(auth.refreshAccessToken(login.refreshToken), UnauthorizedException, 'đã được sử dụng');

      expect(await ctx.prisma.userSession.count()).toBe(0);
      expect(await ctx.prisma.refreshToken.count()).toBe(0);
      await expect(auth.refreshAccessToken(rotated.refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('keeps other sessions of the user alive when one session is killed by reuse', async () => {
      const user = await seedLoginUser();
      const a = await loginAs(user);
      await loginAs(user);
      await auth.refreshAccessToken(a.refreshToken);

      await expect(auth.refreshAccessToken(a.refreshToken)).rejects.toThrow(UnauthorizedException);

      expect(await ctx.prisma.userSession.count()).toBe(1);
    });

    it('rejects when the user was deactivated and revokes nothing', async () => {
      const user = await seedLoginUser();
      const { refreshToken } = await loginAs(user);
      await ctx.prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

      await expectRejection(auth.refreshAccessToken(refreshToken), UnauthorizedException, 'Phiên đăng nhập không còn tồn tại');

      expect(await ctx.prisma.refreshToken.count({ where: { isRevoked: true } })).toBe(0);
    });

    it('rejects when the token subject differs from the session owner', async () => {
      const owner = await seedLoginUser();
      const other = await seedLoginUser();
      const session = await ctx.prisma.userSession.create({ data: { userId: owner.id } });
      const token = jwt.sign(
        { sub: other.id, sessionId: session.id, typ: 'refresh' },
        { secret: process.env.JWT_REFRESH_SECRET, expiresIn: '1h' },
      );
      await ctx.prisma.refreshToken.create({
        data: {
          userId: owner.id,
          sessionId: session.id,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      });

      await expectRejection(auth.refreshAccessToken(token), UnauthorizedException, 'Phiên đăng nhập không còn tồn tại');
    });

    it('lets exactly one of two concurrent refreshes with the same token succeed', async () => {
      const user = await seedLoginUser();
      const { refreshToken } = await loginAs(user);

      const results = await Promise.allSettled([
        auth.refreshAccessToken(refreshToken),
        auth.refreshAccessToken(refreshToken),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(UnauthorizedException);
      // Nondeterministic by design: the loser either lost the revoke race in the transaction (successor kept)
      // or read the already revoked token and treated it as a replay (session killed). Both end states are allowed.
      const unrevoked = await ctx.prisma.refreshToken.count({ where: { isRevoked: false } });
      const sessions = await ctx.prisma.userSession.count();
      const successorKept = sessions === 1 && unrevoked === 1;
      const sessionKilled = sessions === 0 && unrevoked === 0;
      expect(successorKept || sessionKilled).toBe(true);
    });
  });

  describe('logout', () => {
    it('deletes the own session and its refresh tokens', async () => {
      const user = await seedLoginUser();
      const login = await loginAs(user);
      const session = await ctx.prisma.userSession.findFirstOrThrow();

      const result = await auth.logout(user.id, session.id);

      expect(result).toEqual({ success: true });
      expect(await ctx.prisma.userSession.count()).toBe(0);
      expect(await ctx.prisma.refreshToken.count()).toBe(0);
      await expect(auth.refreshAccessToken(login.refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('does not delete the session of another user', async () => {
      const owner = await seedLoginUser();
      const attacker = await seedLoginUser();
      await loginAs(owner);
      const session = await ctx.prisma.userSession.findFirstOrThrow();

      const result = await auth.logout(attacker.id, session.id);

      expect(result).toEqual({ success: true });
      expect(await ctx.prisma.userSession.count()).toBe(1);
      expect(await ctx.prisma.refreshToken.count()).toBe(1);
    });

    it('leaves the other sessions of the same user', async () => {
      const user = await seedLoginUser();
      await loginAs(user);
      await loginAs(user);
      const [first, second] = await ctx.prisma.userSession.findMany({ orderBy: { createdAt: 'asc' } });

      await auth.logout(user.id, first.id);

      expect((await ctx.prisma.userSession.findMany()).map((s) => s.id)).toEqual([second.id]);
    });

    it('succeeds for an unknown session id', async () => {
      const user = await seedLoginUser();

      await expect(auth.logout(user.id, MISSING)).resolves.toEqual({ success: true });
    });
  });

  describe('getActiveSession', () => {
    it('returns the session with the user and bumps lastActiveAt', async () => {
      const user = await seedLoginUser();
      await auth.login({ email: user.email, password: PASSWORD }, 'ua', '1.2.3.4');
      const before = await ctx.prisma.userSession.findFirstOrThrow();
      const old = new Date('2020-01-01T00:00:00Z');
      await ctx.prisma.userSession.update({ where: { id: before.id }, data: { lastActiveAt: old } });

      const result = await auth.getActiveSession(user.id, before.id);

      expect(result).toMatchObject({
        sessionId: before.id,
        ipAddress: '1.2.3.4',
        userAgent: 'ua',
        user: { id: user.id, email: user.email, isActive: true },
      });
      expect(result.user).not.toHaveProperty('passwordHash');
      const after = await ctx.prisma.userSession.findUniqueOrThrow({ where: { id: before.id } });
      expect(after.lastActiveAt.getTime()).toBeGreaterThan(old.getTime());
      expect(result.lastActiveAt.getTime()).toBe(after.lastActiveAt.getTime());
    });

    it('rejects an unknown session', async () => {
      const user = await seedLoginUser();

      await expect(auth.getActiveSession(user.id, MISSING)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a session that belongs to another user', async () => {
      const owner = await seedLoginUser();
      const other = await seedLoginUser();
      await loginAs(owner);
      const session = await ctx.prisma.userSession.findFirstOrThrow();

      await expect(auth.getActiveSession(other.id, session.id)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getGoogleConnectUrl', () => {
    it('returns a Google consent URL with offline access, scopes and client id', () => {
      const url = new URL(auth.getGoogleConnectUrl('user-1'));

      expect(url.host).toBe('accounts.google.com');
      expect(url.searchParams.get('client_id')).toBe('test-client-id');
      expect(url.searchParams.get('redirect_uri')).toBe(process.env.GOOGLE_REDIRECT_URI);
      expect(url.searchParams.get('access_type')).toBe('offline');
      expect(url.searchParams.get('prompt')).toBe('consent');
      expect(url.searchParams.get('scope')!.split(' ')).toEqual(
        expect.arrayContaining([
          'https://mail.google.com/',
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/userinfo.email',
        ]),
      );
    });

    it('puts a server-signed oauth_state token for the user in state', () => {
      const url = new URL(auth.getGoogleConnectUrl('user-1'));

      expect(jwt.verify(url.searchParams.get('state')!)).toMatchObject({ sub: 'user-1', typ: 'oauth_state' });
    });

    it('expires the state after 10 minutes', () => {
      const url = new URL(auth.getGoogleConnectUrl('user-1'));

      const payload = jwt.decode(url.searchParams.get('state')!);
      expect(payload.exp - payload.iat).toBe(600);
    });
  });

  describe('handleGoogleCallback', () => {
    const stateFor = (userId: string) => new URL(auth.getGoogleConnectUrl(userId)).searchParams.get('state')!;

    it('rejects a missing code before touching Google', async () => {
      await expect(auth.handleGoogleCallback(undefined, 'state')).rejects.toThrow(BadRequestException);

      expect(ctx.google.getToken).not.toHaveBeenCalled();
    });

    it('rejects a missing state', async () => {
      await expect(auth.handleGoogleCallback('code', undefined)).rejects.toThrow(BadRequestException);

      expect(ctx.google.getToken).not.toHaveBeenCalled();
    });

    it('rejects a state signed with another secret', async () => {
      const forged = jwt.sign({ sub: 'x', typ: 'oauth_state' }, { secret: 'attacker-secret' });

      await expect(auth.handleGoogleCallback('code', forged)).rejects.toThrow(BadRequestException);

      expect(ctx.google.getToken).not.toHaveBeenCalled();
    });

    it('rejects an expired state', async () => {
      const user = await seedUser(ctx.prisma);
      const expired = jwt.sign({ sub: user.id, typ: 'oauth_state' }, { expiresIn: '-1s' });

      await expect(auth.handleGoogleCallback('code', expired)).rejects.toThrow(BadRequestException);

      expect(ctx.google.getToken).not.toHaveBeenCalled();
    });

    it('rejects a state of the wrong type (an access token)', async () => {
      const user = await seedLoginUser();
      const { accessToken } = await loginAs(user);

      await expect(auth.handleGoogleCallback('code', accessToken)).rejects.toThrow(BadRequestException);

      expect(ctx.google.getToken).not.toHaveBeenCalled();
    });

    it('rejects a state with no subject', async () => {
      const noSub = jwt.sign({ typ: 'oauth_state' });

      await expect(auth.handleGoogleCallback('code', noSub)).rejects.toThrow(BadRequestException);
    });

    it('rejects when Google returns no access token and stores nothing', async () => {
      const user = await seedUser(ctx.prisma);
      ctx.google.getToken.mockResolvedValue({ tokens: { refresh_token: 'r' } });

      await expect(auth.handleGoogleCallback('code', stateFor(user.id))).rejects.toThrow(BadRequestException);

      const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.googleAccessToken).toBeNull();
      expect(row.googleRefreshToken).toBeNull();
    });

    it('propagates a Google token exchange failure', async () => {
      const user = await seedUser(ctx.prisma);
      const failure = new Error('invalid_grant');
      ctx.google.getToken.mockRejectedValue(failure);

      expect(await rejection(auth.handleGoogleCallback('bad', stateFor(user.id)))).toBe(failure);
    });

    it('stores the tokens encrypted for the user named in state only', async () => {
      const user = await seedUser(ctx.prisma);
      const bystander = await seedUser(ctx.prisma);
      const expiry = Date.now() + 1_800_000;
      ctx.google.getToken.mockResolvedValue({
        tokens: { access_token: 'plain-access', refresh_token: 'plain-refresh', expiry_date: expiry },
      });

      const result = await auth.handleGoogleCallback('the-code', stateFor(user.id));

      expect(result).toEqual({ success: true });
      expect(ctx.google.getToken).toHaveBeenCalledWith('the-code');
      const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.googleAccessToken).toMatch(/^v1:/);
      expect(row.googleRefreshToken).toMatch(/^v1:/);
      expect(row.googleAccessToken).not.toContain('plain-access');
      expect(row.googleRefreshToken).not.toContain('plain-refresh');
      expect(row.googleTokenExpiresAt!.getTime()).toBe(expiry);
      const other = await ctx.prisma.user.findUniqueOrThrow({ where: { id: bystander.id } });
      expect(other.googleAccessToken).toBeNull();
    });

    it('defaults the expiry to about an hour when Google sends none', async () => {
      const user = await seedUser(ctx.prisma);
      ctx.google.getToken.mockResolvedValue({ tokens: { access_token: 'a' } });
      const before = Date.now();

      await auth.handleGoogleCallback('code', stateFor(user.id));

      const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      const delta = row.googleTokenExpiresAt!.getTime() - before;
      expect(delta).toBeGreaterThanOrEqual(3_600_000 - 1000);
      expect(delta).toBeLessThanOrEqual(3_600_000 + 5000);
    });

    it('keeps the stored refresh token when Google returns only an access token', async () => {
      const user = await seedGoogleUser(ctx.prisma, factory, { refresh_token: 'old-refresh' });
      const before = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      ctx.google.getToken.mockResolvedValue({ tokens: { access_token: 'new-access' } });

      await auth.handleGoogleCallback('code', stateFor(user.id));

      const after = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.googleRefreshToken).toBe(before.googleRefreshToken);
      expect(after.googleAccessToken).not.toBe(before.googleAccessToken);
    });
  });

  describe('Google status and disconnect', () => {
    it('reports connected only when a refresh token is stored', async () => {
      const connected = await seedGoogleUser(ctx.prisma, factory);
      const accessOnly = await seedUser(ctx.prisma, { googleAccessToken: 'v1:x' });
      const none = await seedUser(ctx.prisma);

      expect(await auth.getGoogleStatus(connected.id)).toEqual({ connected: true });
      expect(await auth.getGoogleStatus(accessOnly.id)).toEqual({ connected: false });
      expect(await auth.getGoogleStatus(none.id)).toEqual({ connected: false });
    });

    it('revokes the refresh token at Google, then clears tokens and the Gmail history id', async () => {
      const user = await seedGoogleUser(ctx.prisma, factory, { refresh_token: 'the-refresh' }, { gmailHistoryId: '42' });
      const bystander = await seedGoogleUser(ctx.prisma, factory);
      ctx.google.revokeToken.mockResolvedValue({});

      await auth.disconnectGoogle(user.id);

      expect(ctx.google.revokeToken).toHaveBeenCalledWith('the-refresh');
      const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row).toMatchObject({
        googleAccessToken: null,
        googleRefreshToken: null,
        googleTokenExpiresAt: null,
        gmailHistoryId: null,
      });
      expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: bystander.id } })).googleRefreshToken).not.toBeNull();
      expect(await auth.getGoogleStatus(user.id)).toEqual({ connected: false });
    });

    it('still clears the tokens when Google refuses the revoke', async () => {
      const user = await seedGoogleUser(ctx.prisma, factory);
      ctx.google.revokeToken.mockRejectedValue(new Error('invalid_token'));

      await auth.disconnectGoogle(user.id);

      const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.googleAccessToken).toBeNull();
      expect(row.googleRefreshToken).toBeNull();
    });

    it('skips the revoke for a user that is not connected', async () => {
      const user = await seedUser(ctx.prisma);

      await auth.disconnectGoogle(user.id);

      expect(ctx.google.revokeToken).not.toHaveBeenCalled();
    });

    it('leaves no client for a disconnected user', async () => {
      const user = await seedGoogleUser(ctx.prisma, factory);
      ctx.google.revokeToken.mockResolvedValue({});

      await auth.disconnectGoogle(user.id);

      expect(await factory.forUser(user.id)).toBeNull();
      expect(await factory.forConnectedUser()).toBeNull();
    });
  });

  describe('AuthController google callback redirect', () => {
    let controller: AuthController;
    const redirectOf = async (code?: string, state?: string) => {
      const res = { redirect: vi.fn() };
      await controller.handleGoogleCallback(code as string, state as string, res as any);
      expect(res.redirect).toHaveBeenCalledTimes(1);
      return res.redirect.mock.calls[0] as [number, string];
    };
    const stateFor = (userId: string) => new URL(auth.getGoogleConnectUrl(userId)).searchParams.get('state')!;

    beforeAll(() => {
      controller = ctx.moduleRef.get(AuthController);
    });

    it('redirects to settings with google=connected on success', async () => {
      const user = await seedUser(ctx.prisma);
      ctx.google.getToken.mockResolvedValue({ tokens: { access_token: 'a', refresh_token: 'r' } });

      expect(await redirectOf('code', stateFor(user.id))).toEqual([302, 'http://localhost:3001/settings?google=connected']);
      expect((await auth.getGoogleStatus(user.id)).connected).toBe(true);
    });

    it('redirects with reason missing_code', async () => {
      expect(await redirectOf(undefined, 'state')).toEqual([302, 'http://localhost:3001/settings?google=error&reason=missing_code']);
    });

    it('redirects with reason invalid_state', async () => {
      expect(await redirectOf('code', 'forged')).toEqual([302, 'http://localhost:3001/settings?google=error&reason=invalid_state']);
    });

    it('redirects with reason no_token when Google returns no access token', async () => {
      const user = await seedUser(ctx.prisma);
      ctx.google.getToken.mockResolvedValue({ tokens: {} });

      expect(await redirectOf('code', stateFor(user.id))).toEqual([302, 'http://localhost:3001/settings?google=error&reason=no_token']);
    });

    it('redirects with reason exchange_failed when the token exchange throws', async () => {
      const user = await seedUser(ctx.prisma);
      ctx.google.getToken.mockRejectedValue(new Error('invalid_grant'));

      expect(await redirectOf('bad', stateFor(user.id))).toEqual([302, 'http://localhost:3001/settings?google=error&reason=exchange_failed']);
    });
  });

  describe('GoogleClientFactory', () => {
    it('createOAuthClient uses the configured client id, secret and redirect uri', () => {
      const client: any = factory.createOAuthClient();

      expect(client._clientId).toBe('test-client-id');
      expect(client._clientSecret).toBe('test-client-secret');
      expect(client.redirectUri).toBe(process.env.GOOGLE_REDIRECT_URI);
    });

    it('saveTokens stores v1 AES-GCM blobs, never the plaintext', async () => {
      const user = await seedUser(ctx.prisma);
      const expiry = Date.now() + 60_000;

      await factory.saveTokens(user.id, { access_token: 'AT', refresh_token: 'RT', expiry_date: expiry });

      const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.googleAccessToken).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/);
      expect(row.googleRefreshToken).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/);
      expect(row.googleTokenExpiresAt!.getTime()).toBe(expiry);
    });

    it('saveTokens uses a fresh IV so the same token encrypts differently each time', async () => {
      const user = await seedUser(ctx.prisma);
      await factory.saveTokens(user.id, { access_token: 'same' });
      const first = (await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).googleAccessToken;

      await factory.saveTokens(user.id, { access_token: 'same' });
      const second = (await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).googleAccessToken;

      expect(first).not.toBe(second);
    });

    it('saveTokens leaves fields it was not given untouched', async () => {
      const user = await seedGoogleUser(ctx.prisma, factory);
      const before = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });

      await factory.saveTokens(user.id, { access_token: 'rotated' });

      const after = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.googleRefreshToken).toBe(before.googleRefreshToken);
      expect(after.googleTokenExpiresAt).toEqual(before.googleTokenExpiresAt);
      expect(after.googleAccessToken).not.toBe(before.googleAccessToken);
    });

    it('forUser returns null for an unknown user', async () => {
      expect(await factory.forUser(MISSING)).toBeNull();
    });

    it('forUser returns null for a user without Google tokens', async () => {
      const user = await seedUser(ctx.prisma);

      expect(await factory.forUser(user.id)).toBeNull();
    });

    it('forUser returns a client with the decrypted credentials', async () => {
      const expiry = Date.now() + 3_600_000;
      const user = await seedGoogleUser(ctx.prisma, factory, {
        access_token: 'AT-1',
        refresh_token: 'RT-1',
        expiry_date: expiry,
      });

      const client = await factory.forUser(user.id);

      expect(client!.credentials).toEqual({ access_token: 'AT-1', refresh_token: 'RT-1', expiry_date: expiry });
    });

    it('forUser works when only an access token is stored', async () => {
      const user = await seedUser(ctx.prisma);
      await factory.saveTokens(user.id, { access_token: 'only-access' });

      const client = await factory.forUser(user.id);

      expect(client!.credentials.access_token).toBe('only-access');
      expect(client!.credentials.refresh_token).toBeUndefined();
    });

    it('saves tokens refreshed by Google (tokens event) encrypted into the user row', async () => {
      const user = await seedGoogleUser(ctx.prisma, factory, { access_token: 'AT-old' });
      const client = (await factory.forUser(user.id))!;
      const before = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      const expiry = Date.now() + 7_200_000;

      client.emit('tokens', { access_token: 'AT-new', expiry_date: expiry });

      await vi.waitFor(async () => {
        const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
        expect(row.googleAccessToken).not.toBe(before.googleAccessToken);
        expect(row.googleTokenExpiresAt!.getTime()).toBe(expiry);
      });
      const reloaded = (await factory.forUser(user.id))!;
      expect(reloaded.credentials.access_token).toBe('AT-new');
      expect(reloaded.credentials.refresh_token).toBe('refresh-token');
    });
  });

  describe('JwtStrategy.validate', () => {
    it('returns the identity for a live session', async () => {
      const user = await seedLoginUser();
      const { accessToken } = await loginAs(user);
      const payload = jwt.verify(accessToken);

      expect(await strategy.validate(payload)).toEqual({
        userId: user.id,
        email: user.email,
        sessionId: payload.sessionId,
      });
    });

    it('rejects when the session was deleted (logout)', async () => {
      const user = await seedLoginUser();
      const { accessToken } = await loginAs(user);
      const payload = jwt.verify(accessToken);
      await auth.logout(user.id, payload.sessionId);

      await expectRejection(strategy.validate(payload), UnauthorizedException, 'Phiên đăng nhập không còn hiệu lực');
    });

    it('rejects when the user became inactive', async () => {
      const user = await seedLoginUser();
      const { accessToken } = await loginAs(user);
      await ctx.prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

      await expect(strategy.validate(jwt.verify(accessToken))).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when the session belongs to a different user than sub', async () => {
      const owner = await seedLoginUser();
      const other = await seedLoginUser();
      const { accessToken } = await loginAs(owner);
      const payload = { ...jwt.verify(accessToken), sub: other.id };

      await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
    });

    it.each(['refresh', 'oauth_state'])('rejects a %s token used as an access token', async (typ) => {
      const user = await seedLoginUser();
      await loginAs(user);
      const session = await ctx.prisma.userSession.findFirstOrThrow();

      await expectRejection(
        strategy.validate({ sub: user.id, email: user.email, sessionId: session.id, typ } as any),
        UnauthorizedException,
        'Token không hợp lệ',
      );
    });

    it('rejects a payload without a session id', async () => {
      await expect(strategy.validate({ sub: 'u', email: 'e', typ: 'access' } as any)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
