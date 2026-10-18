import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { decryptToken, encryptToken } from '../common/crypto/token-cipher';
import { PrismaService } from '../prisma/prisma.service';

interface GoogleTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
}

@Injectable()
export class GoogleClientFactory {
  private readonly logger = new Logger(GoogleClientFactory.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private get key(): string {
    return this.configService.getOrThrow<string>('TOKEN_ENCRYPTION_KEY');
  }

  createOAuthClient() {
    return new google.auth.OAuth2(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
      this.configService.get<string>('GOOGLE_REDIRECT_URI'),
    );
  }

  /** Lưu Google tokens (đã mã hóa AES-256-GCM) vào bảng users */
  async saveTokens(userId: string, tokens: GoogleTokens) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(tokens.access_token && {
          googleAccessToken: encryptToken(tokens.access_token, this.key),
        }),
        ...(tokens.refresh_token && {
          googleRefreshToken: encryptToken(tokens.refresh_token, this.key),
        }),
        ...(tokens.expiry_date && {
          googleTokenExpiresAt: new Date(tokens.expiry_date),
        }),
      },
    });
  }

  /**
   * OAuth2 client cho user đã kết nối Google; null nếu chưa kết nối.
   * Token được Google làm mới sẽ tự động lưu lại vào DB.
   */
  async forUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.googleAccessToken) {
      return null;
    }

    const client = this.createOAuthClient();
    client.setCredentials({
      access_token: decryptToken(user.googleAccessToken, this.key),
      refresh_token: user.googleRefreshToken
        ? decryptToken(user.googleRefreshToken, this.key)
        : undefined,
      expiry_date: user.googleTokenExpiresAt?.getTime(),
    });

    client.on('tokens', (tokens) => {
      this.saveTokens(userId, tokens).catch((error) =>
        this.logger.error('Không lưu được Google token đã làm mới', error),
      );
    });

    return client;
  }

  /**
   * Ngắt kết nối Google: thu hồi token ở Google (best effort, lỗi chỉ ghi log) rồi xóa token trong DB.
   * gmailHistoryId gắn với hộp thư đã kết nối nên xóa cùng: kết nối lại sẽ nạp lại từ đầu.
   */
  async disconnect(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const stored = user?.googleRefreshToken ?? user?.googleAccessToken;
    if (stored) {
      try {
        await this.createOAuthClient().revokeToken(
          decryptToken(stored, this.key),
        );
      } catch (error) {
        this.logger.warn(`Không thu hồi được token tại Google: ${error}`);
      }
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        googleAccessToken: null,
        googleRefreshToken: null,
        googleTokenExpiresAt: null,
        gmailHistoryId: null,
      },
    });
  }

  /** User đầu tiên đã kết nối Google cùng OAuth2 client của họ; null nếu chưa ai kết nối */
  async forConnectedUser() {
    const user = await this.prisma.user.findFirst({
      where: { googleAccessToken: { not: null } },
      select: { id: true, gmailHistoryId: true },
    });
    const auth = user && (await this.forUser(user.id));
    return user && auth ? { user, auth } : null;
  }
}
