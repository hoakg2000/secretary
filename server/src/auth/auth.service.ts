import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { google } from 'googleapis';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // Helper băm token bằng SHA-256
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async login(loginDto: LoginDto, userAgent?: string, ipAddress?: string) {
    const { email, password } = loginDto;

    // 1. Kiểm tra Master User
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.passwordHash) {
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

    // 4. Tạo JWT Access Token và Refresh Token
    const payload = { sub: user.id, email: user.email, sessionId: session.id };
    const accessToken = this.jwtService.sign(payload);

    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: (this.configService.get('JWT_REFRESH_EXPIRES_IN') ||
        '7d') as any,
    });

    // 5. Băm Refresh Token và lưu vào database
    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
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
        secret:
          this.configService.get<string>('JWT_SECRET') || 'defaultSecretKey',
      });
    } catch {
      throw new UnauthorizedException(
        'Refresh Token không hợp lệ hoặc đã hết hạn',
      );
    }

    // 2. Băm Refresh Token nhận được và tìm trong Database
    const tokenHash = this.hashToken(refreshTokenStr);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (
      !storedToken ||
      storedToken.isRevoked ||
      storedToken.expiresAt < new Date()
    ) {
      throw new UnauthorizedException(
        'Refresh Token đã bị thu hồi hoặc hết hạn',
      );
    }

    // 3. Kiểm tra User Session còn tồn tại không
    if (payload.sessionId) {
      const session = await this.prisma.userSession.findUnique({
        where: { id: payload.sessionId },
      });
      if (!session) {
        throw new UnauthorizedException('Phiên đăng nhập không còn tồn tại');
      }
    }

    // 4. Tạo Access Token mới
    const newPayload = {
      sub: payload.sub,
      email: payload.email,
      sessionId: payload.sessionId,
    };
    const accessToken = this.jwtService.sign(newPayload);

    return { accessToken };
  }

  async logout(userId: string, sessionId?: string, refreshTokenStr?: string) {
    // 1. Thu hồi (revoke) Refresh Token nếu có
    if (refreshTokenStr) {
      const tokenHash = this.hashToken(refreshTokenStr);
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash, userId },
        data: { isRevoked: true },
      });
    } else {
      // Nếu không có token truyền lên, vô hiệu hóa toàn bộ refresh tokens còn hiệu lực của user
      await this.prisma.refreshToken.updateMany({
        where: { userId, isRevoked: false },
        data: { isRevoked: true },
      });
    }

    // 2. Xóa phiên làm việc trong bảng user_sessions
    if (sessionId) {
      await this.prisma.userSession
        .delete({
          where: { id: sessionId },
        })
        .catch(() => null);
    }

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

  getGoogleConnectUrl(): string {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>('GOOGLE_REDIRECT_URI');

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri,
    );

    const scopes = [
      'https://mail.google.com/',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/userinfo.email',
    ];

    return oauth2Client.generateAuthUrl({
      access_type: 'offline', // Để Google trả về Refresh Token
      prompt: 'consent', // Bắt buộc hiển thị màn hình chấp thuận để thu được Refresh Token
      scope: scopes,
    });
  }

  async handleGoogleCallback(code: string, userId?: string) {
    if (!code) {
      throw new BadRequestException('Mã xác thực (code) không hợp lệ');
    }

    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>('GOOGLE_REDIRECT_URI');

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri,
    );

    // 1. Đổi mã Authorization Code lấy Access & Refresh Tokens từ Google
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token) {
      throw new BadRequestException('Không thể lấy Access Token từ Google');
    }

    // 2. Lấy ID người dùng (Nếu không truyền userId, mặc định lấy Master User do là hệ thống Single User)
    let targetUserId = userId;
    if (!targetUserId) {
      const user = await this.prisma.user.findFirst();
      if (!user) {
        throw new NotFoundException('Không tìm thấy Master User');
      }
      targetUserId = user.id;
    }

    // 3. Tính thời gian hết hạn của Access Token
    const expiresAt = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000);

    // 4. Cập nhật Google tokens vào bảng users
    await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        googleAccessToken: tokens.access_token,
        ...(tokens.refresh_token && {
          googleRefreshToken: tokens.refresh_token,
        }),
        googleTokenExpiresAt: expiresAt,
      },
    });

    return { success: true };
  }
}
