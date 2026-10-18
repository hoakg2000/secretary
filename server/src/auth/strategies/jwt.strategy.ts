import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  sessionId: string;
  typ: 'access' | 'refresh' | 'oauth_state';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload?.sub || !payload.sessionId || payload.typ !== 'access') {
      throw new UnauthorizedException('Token không hợp lệ');
    }

    const session = await this.prisma.userSession.findUnique({
      where: { id: payload.sessionId },
      select: { userId: true, user: { select: { isActive: true } } },
    });

    if (!session || session.userId !== payload.sub || !session.user.isActive) {
      throw new UnauthorizedException('Phiên đăng nhập không còn hiệu lực');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      sessionId: payload.sessionId,
    };
  }
}
