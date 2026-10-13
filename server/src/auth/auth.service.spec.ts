import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

const env: Record<string, string> = {
  JWT_REFRESH_SECRET: 'r'.repeat(32),
  JWT_REFRESH_EXPIRES_IN: '7d',
};

// In-memory stand-in for the two tables the refresh flow touches (with the session -> token cascade)
function fakePrisma() {
  const tokens: any[] = [];
  const sessions = new Map<string, any>([
    ['s1', { id: 's1', userId: 'u1', user: { email: 'a@b.c', isActive: true } }],
  ]);
  const prisma: any = {
    tokens,
    sessions,
    refreshToken: {
      create: async ({ data }: any) => {
        tokens.push({ id: `t${tokens.length}`, isRevoked: false, ...data });
      },
      findUnique: async ({ where }: any) => {
        const token = tokens.find((t) => t.tokenHash === where.tokenHash);
        return token ? { ...token, session: sessions.get(token.sessionId) } : null;
      },
      updateMany: async ({ where, data }: any) => {
        const hit = tokens.filter(
          (t) => t.id === where.id && t.isRevoked === where.isRevoked,
        );
        hit.forEach((t) => Object.assign(t, data));
        return { count: hit.length };
      },
    },
    userSession: {
      deleteMany: async ({ where }: any) => {
        sessions.delete(where.id);
        for (let i = tokens.length - 1; i >= 0; i--) {
          if (tokens[i].sessionId === where.id) tokens.splice(i, 1);
        }
      },
    },
    $transaction: async (fn: any) => fn(prisma),
  };
  return prisma;
}

function build() {
  const prisma = fakePrisma();
  const jwt = new JwtService({
    secret: 'a'.repeat(32),
    signOptions: { expiresIn: '15m' },
  });
  const config = { getOrThrow: (key: string) => env[key] };
  const service = new AuthService(prisma, jwt, config as any, {} as any);
  return { prisma, jwt, service };
}

async function issue(service: AuthService, prisma: any) {
  const { refreshToken } = await (service as any).issueRefreshToken(
    prisma,
    'u1',
    's1',
  );
  return refreshToken as string;
}

describe('AuthService refresh rotation', () => {
  it('rotates: returns a successor and revokes the presented token', async () => {
    const { prisma, jwt, service } = build();
    const first = await issue(service, prisma);

    const result = await service.refreshAccessToken(first);

    expect(result.refreshToken).not.toBe(first);
    expect(jwt.decode(result.accessToken).typ).toBe('access');
    expect(prisma.tokens.map((t: any) => t.isRevoked)).toEqual([true, false]);
    expect(result.refreshExpiresAt.getTime()).toBe(
      jwt.decode(result.refreshToken).exp * 1000,
    );
  });

  it('replay of a rotated token kills the session and the successor', async () => {
    const { prisma, service } = build();
    const first = await issue(service, prisma);
    const { refreshToken: second } = await service.refreshAccessToken(first);

    await expect(service.refreshAccessToken(first)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.sessions.has('s1')).toBe(false);
    await expect(service.refreshAccessToken(second)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an access token presented as a refresh token', async () => {
    const { jwt, service } = build();
    const access = jwt.sign({ sub: 'u1', sessionId: 's1', typ: 'access' });
    await expect(service.refreshAccessToken(access)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('AuthService Google OAuth state', () => {
  it('rejects a missing state and a token signed for another purpose', async () => {
    const { jwt, service } = build();
    await expect(service.handleGoogleCallback('code')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const access = jwt.sign({ sub: 'u1', sessionId: 's1', typ: 'access' });
    await expect(
      service.handleGoogleCallback('code', access),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
