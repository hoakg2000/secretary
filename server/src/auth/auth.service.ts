import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { GoogleClientFactory } from './google-client.factory';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly googleClientFactory: GoogleClientFactory,
  ) {}

  // Helper băm token bằng SHA-256
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private signAccessToken(userId: string, email: string, sessionId: string) {
    return this.jwtService.sign({
      sub: userId,
      email,
      sessionId,
      typ: 'access',
    });
  }

  /**
   * Tạo Refresh Token gắn với session và lưu hash vào DB.
   * Dùng secret riêng + typ 'refresh' nên không thể dùng làm Access Token.
   */
  private async issueRefreshToken(
    db: Prisma.TransactionClient,
    userId: string,
    sessionId: string,
  ) {
    const refreshToken = this.jwtService.sign(
      // jti: hai token ký trong cùng một giây vẫn phải khác nhau (token_hash là unique)
      { sub: userId, sessionId, typ: 'refresh', jti: crypto.randomUUID() },
      {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.getOrThrow('JWT_REFRESH_EXPIRES_IN'),
      },
    );
    // Hạn trong DB và cookie lấy từ chính claim exp của token
    const expiresAt = new Date(this.jwtService.decode(refreshToken).exp * 1000);

    await db.refreshToken.create({
      data: {
        userId,
        sessionId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt,
      },
    });

    return { refreshToken, refreshExpiresAt: expiresAt };
  }

  async login(loginDto: LoginDto, userAgent?: string, ipAddress?: string) {
    const { email, password } = loginDto;

    // 1. Kiểm tra Master User
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.passwordHash || !user.isActive) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    // 2. Xác thực mật khẩu
    const isPasswordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordMatch) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    // 3. Tạo UserSession
    const session = await this.prisma.userSession.create({
      data: {
        userId: user.id,
        userAgent: userAgent || 'Unknown',
        ipAddress: ipAddress || '127.0.0.1',
      },
    });

    // 4. Tạo JWT Access Token và Refresh Token (hash lưu vào database)
    const accessToken = this.signAccessToken(user.id, user.email, session.id);
    const refresh = await this.issueRefreshToken(
      this.prisma,
      user.id,
      session.id,
    );

    return {
      accessToken,
      ...refresh,
      user: {
        id: user.id,
        email: user.email,
      },
    };
  }

  async refreshAccessToken(refreshTokenStr?: string) {
    if (!refreshTokenStr) {
      throw new UnauthorizedException('Refresh Token không tồn tại');
    }

    // 1. Verify chữ ký JWT của Refresh Token
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(refreshTokenStr, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException(
        'Refresh Token không hợp lệ hoặc đã hết hạn',
      );
    }

    if (payload.typ !== 'refresh' || !payload.sessionId) {
      throw new UnauthorizedException('Refresh Token không hợp lệ');
    }

    // 2. Băm Refresh Token nhận được và tìm trong Database
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(refreshTokenStr) },
      include: {
        session: {
          include: { user: { select: { email: true, isActive: true } } },
        },
      },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException(
        'Refresh Token đã bị thu hồi hoặc hết hạn',
      );
    }

    // 3. Token đã xoay vòng mà bị dùng lại -> replay: hủy cả phiên (cascade xóa mọi refresh token của phiên)
    if (storedToken.isRevoked) {
      await this.prisma.userSession.deleteMany({
        where: { id: storedToken.sessionId },
      });
      throw new UnauthorizedException(
        'Refresh Token đã được sử dụng. Phiên đăng nhập đã bị hủy',
      );
    }

    const { session } = storedToken;
    if (session.userId !== payload.sub || !session.user.isActive) {
      throw new UnauthorizedException('Phiên đăng nhập không còn tồn tại');
    }

    // 4. Xoay vòng: thu hồi token cũ và cấp token kế nhiệm trong cùng một transaction
    const refresh = await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshToken.updateMany({
        where: { id: storedToken.id, isRevoked: false },
        data: { isRevoked: true },
      });
      if (revoked.count === 0) {
        throw new UnauthorizedException('Refresh Token đã được sử dụng');
      }
      return this.issueRefreshToken(tx, session.userId, session.id);
    });

    return {
      accessToken: this.signAccessToken(
        session.userId,
        session.user.email,
        session.id,
      ),
      ...refresh,
    };
  }

  /**
   * Kết thúc một phiên của user (mặc định là phiên hiện tại).
   * Refresh token của phiên bị xóa theo (onDelete: Cascade).
   */
  async logout(userId: string, sessionId: string) {
    await this.prisma.userSession.deleteMany({
      where: { id: sessionId, userId },
    });

    return { success: true };
  }

  async getActiveSession(userId: string, sessionId: string) {
    // 1. Truy vấn thông tin session và thông tin user
    const session = await this.prisma.userSession.findFirst({
      where: {
        id: sessionId,
        userId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            isActive: true,
            createdAt: true,
          },
        },
      },
    });

    if (!session) {
      throw new UnauthorizedException(
        'Phiên làm việc không tồn tại hoặc đã hết hạn',
      );
    }

    // 2. Cập nhật timestamp lastActiveAt
    const updatedSession = await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { lastActiveAt: new Date() },
    });

    return {
      sessionId: session.id,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      lastActiveAt: updatedSession.lastActiveAt,
      createdAt: session.createdAt,
      user: session.user,
    };
  }

  getGoogleConnectUrl(userId: string): string {
    const scopes = [
      'https://mail.google.com/',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/userinfo.email',
    ];

    // state ký bằng JWT, mang userId: callback không cần (và không được) đoán user
    const state = this.jwtService.sign(
      { sub: userId, typ: 'oauth_state' },
      { expiresIn: '10m' },
    );

    return this.googleClientFactory.createOAuthClient().generateAuthUrl({
      access_type: 'offline', // Để Google trả về Refresh Token
      prompt: 'consent', // Bắt buộc hiển thị màn hình chấp thuận để thu được Refresh Token
      scope: scopes,
      state,
    });
  }

  async handleGoogleCallback(code?: string, state?: string) {
    if (!code) {
      throw new BadRequestException('Mã xác thực (code) không hợp lệ');
    }

    // 1. Xác minh state: phải do server ký cho đúng mục đích OAuth
    let userId: string;
    try {
      const payload = this.jwtService.verify(state ?? '');
      if (payload.typ !== 'oauth_state' || !payload.sub) {
        throw new Error('wrong token type');
      }
      userId = payload.sub;
    } catch {
      throw new BadRequestException(
        'Tham số state không hợp lệ hoặc đã hết hạn',
      );
    }

    // 2. Đổi mã Authorization Code lấy Access & Refresh Tokens từ Google
    const { tokens } = await this.googleClientFactory
      .createOAuthClient()
      .getToken(code);

    if (!tokens.access_token) {
      throw new BadRequestException('Không thể lấy Access Token từ Google');
    }

    // 3. Mã hóa và lưu Google tokens vào bảng users
    await this.googleClientFactory.saveTokens(userId, {
      ...tokens,
      expiry_date: tokens.expiry_date ?? Date.now() + 3600 * 1000,
    });

    return { success: true };
  }
}
