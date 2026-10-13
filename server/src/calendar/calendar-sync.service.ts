import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { google } from 'googleapis';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger(CalendarSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Khởi tạo Google Calendar Client với OAuth2 Tokens của Master User
   */
  private async getGoogleCalendarClient() {
    const user = await this.prisma.user.findFirst({
      where: {
        googleAccessToken: { not: null },
      },
    });

    if (!user || !user.googleAccessToken) {
      return null;
    }

    const oauth2Client = new google.auth.OAuth2(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
      this.configService.get<string>('GOOGLE_REDIRECT_URI'),
    );

    oauth2Client.setCredentials({
      access_token: user.googleAccessToken,
      refresh_token: user.googleRefreshToken,
    });

    return google.calendar({ version: 'v3', auth: oauth2Client });
  }

  /**
   * Đồng bộ các sự kiện bị đánh dấu DIRTY từ Local -> Google Calendar
   */
  async syncLocalToGoogle() {
    const calendarClient = await this.getGoogleCalendarClient();
    if (!calendarClient) {
      this.logger.warn('Chưa kết nối tài khoản Google OAuth2. Bỏ qua đồng bộ.');
      return;
    }

    // Lấy danh sách sự kiện DIRTY
    const dirtySyncStates = await this.prisma.calendarSyncState.findMany({
      where: { syncStatus: 'DIRTY' },
      include: { localEvent: true },
    });

    for (const syncState of dirtySyncStates) {
      const { localEvent, googleEventId } = syncState;

      try {
        const eventResource = {
          summary: localEvent.title,
          description: localEvent.description || undefined,
          location: localEvent.location || undefined,
          start: { dateTime: localEvent.startTime.toISOString() },
          end: { dateTime: localEvent.endTime.toISOString() },
        };

        if (googleEventId) {
          // Cập nhật sự kiện đã có trên Google Calendar
          const res = await calendarClient.events.update({
            calendarId: 'primary',
            eventId: googleEventId,
            requestBody: eventResource,
          });

          await this.prisma.calendarSyncState.update({
            where: { id: syncState.id },
            data: {
              syncStatus: 'SYNCED',
              eTag: res.data.etag,
              lastSyncedAt: new Date(),
            },
          });
        } else {
          // Tạo sự kiện mới trên Google Calendar
          const res = await calendarClient.events.insert({
            calendarId: 'primary',
            requestBody: eventResource,
          });

          await this.prisma.calendarSyncState.update({
            where: { id: syncState.id },
            data: {
              googleEventId: res.data.id,
              syncStatus: 'SYNCED',
              eTag: res.data.etag,
              lastSyncedAt: new Date(),
            },
          });
        }
      } catch (error) {
        this.logger.error(
          `Lỗi khi đồng bộ sự kiện ID ${localEvent.id} lên Google Calendar:`,
          error,
        );
      }
    }
  }

  /**
   * Cronjob tự động thực thi đồng bộ 5 phút một lần
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCalendarCronSync() {
    this.logger.log('Bắt đầu Cronjob đồng bộ Google Calendar...');
    await this.syncLocalToGoogle();
    this.logger.log('Hoàn thành Cronjob đồng bộ Google Calendar.');
  }
}
