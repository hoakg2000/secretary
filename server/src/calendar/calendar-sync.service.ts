import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { CalendarSyncState, LocalCalendar } from '@prisma/client';
import { CronJob } from 'cron';
import { calendar_v3, google } from 'googleapis';
import { GoogleClientFactory } from '../auth/google-client.factory';
import { isGone, statusOf } from '../common/google/google-errors';
import { runExclusive } from '../common/run-exclusive';
import { PrismaService } from '../prisma/prisma.service';

export interface CalendarSyncResult {
  pushed: number;
  deleted: number;
  removedRemotely: number;
  failed: number;
}

type DirtyState = CalendarSyncState & { localEvent: LocalCalendar };
type SyncOutcome = 'pushed' | 'deleted' | 'removedRemotely';

const CALENDAR_ID = 'primary';

/**
 * Đồng bộ MỘT CHIỀU Local -> Google Calendar. Local là nguồn dữ liệu gốc.
 */
@Injectable()
export class CalendarSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CalendarSyncService.name);
  private readonly lock = { running: false };

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly googleClientFactory: GoogleClientFactory,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  // Đăng ký cron lúc bootstrap thay vì @Cron(process.env...): decorator chạy trước khi ConfigModule nạp .env
  onApplicationBootstrap() {
    const expression = this.configService.get<string>(
      'CALENDAR_SYNC_CRON',
      CronExpression.EVERY_5_MINUTES,
    );
    const job = new CronJob(expression, () => {
      void this.handleCalendarCronSync();
    });
    this.schedulerRegistry.addCronJob('calendar-sync', job);
    job.start();
  }

  /**
   * Khởi tạo Google Calendar Client với OAuth2 Tokens của Master User
   */
  private async getGoogleCalendarClient() {
    const connected = await this.googleClientFactory.forConnectedUser();
    return connected
      ? google.calendar({ version: 'v3', auth: connected.auth })
      : null;
  }

  /**
   * Đẩy các sự kiện DIRTY từ Local -> Google Calendar.
   * Trả về null nếu bỏ qua (đang có lượt chạy khác hoặc chưa kết nối Google).
   */
  async syncLocalToGoogle(): Promise<CalendarSyncResult | null> {
    return runExclusive(
      this.lock,
      async () => {
        const calendarClient = await this.getGoogleCalendarClient();
        if (!calendarClient) {
          this.logger.warn(
            'Chưa kết nối tài khoản Google OAuth2. Bỏ qua đồng bộ.',
          );
          return null;
        }

        const dirtySyncStates = await this.prisma.calendarSyncState.findMany({
          where: { syncStatus: 'DIRTY' },
          include: { localEvent: true },
        });

        const result: CalendarSyncResult = {
          pushed: 0,
          deleted: 0,
          removedRemotely: 0,
          failed: 0,
        };

        for (const syncState of dirtySyncStates) {
          try {
            result[await this.syncOne(calendarClient, syncState)]++;
          } catch (error) {
            result.failed++;
            this.logger.error(
              `Lỗi khi đồng bộ sự kiện ID ${syncState.localEventId} lên Google Calendar:`,
              error,
            );
          }
        }

        this.logger.log(`Kết quả đồng bộ: ${JSON.stringify(result)}`);
        return result;
      },
      () => {
        this.logger.warn('Lượt đồng bộ trước chưa xong. Bỏ qua lượt này.');
        return null;
      },
    );
  }

  private async syncOne(
    calendarClient: calendar_v3.Calendar,
    syncState: DirtyState,
  ): Promise<SyncOutcome> {
    const { localEvent } = syncState;

    // --- Đã xóa mềm ở local: xóa trên Google rồi xóa hẳn ---
    if (localEvent.deletedAt) {
      if (syncState.googleEventId) {
        try {
          await calendarClient.events.delete({
            calendarId: CALENDAR_ID,
            eventId: syncState.googleEventId,
          });
        } catch (error) {
          if (!isGone(error)) throw error;
        }
      }
      await this.prisma.localCalendar.delete({ where: { id: localEvent.id } });
      return 'deleted';
    }

    // Chỉ gửi các field do local sở hữu: attendees/field thêm bên Google không bị ghi đè
    const eventFields: calendar_v3.Schema$Event = {
      summary: localEvent.title,
      description: localEvent.description,
      location: localEvent.location,
      start: { dateTime: localEvent.startTime.toISOString() },
      end: { dateTime: localEvent.endTime.toISOString() },
    };

    let googleEventId = syncState.googleEventId;
    let eTag: string | null | undefined;
    let inserted = false;

    // --- Chưa có trên Google: insert với ID do client sinh -> retry không tạo trùng ---
    if (!googleEventId) {
      googleEventId = localEvent.id.replace(/-/g, '');
      try {
        const res = await calendarClient.events.insert({
          calendarId: CALENDAR_ID,
          requestBody: { ...eventFields, id: googleEventId },
        });
        eTag = res.data.etag;
        inserted = true;
      } catch (error) {
        // 409: lượt trước đã tạo nhưng chưa kịp lưu DB -> xử lý tiếp như update
        if (statusOf(error) !== 409) throw error;
      }
    }

    // --- Update (hoặc insert vừa gặp 409) ---
    if (!inserted) {
      try {
        const res = await calendarClient.events.patch({
          calendarId: CALENDAR_ID,
          eventId: googleEventId,
          requestBody: eventFields,
        });
        eTag = res.data.etag;
      } catch (error) {
        if (!isGone(error)) throw error;

        this.logger.warn(
          `Sự kiện ${localEvent.id} đã bị xóa trên Google. Ngừng đồng bộ sự kiện này.`,
        );
        await this.markSynced(syncState, { googleEventId: null, eTag: null });
        return 'removedRemotely';
      }
    }

    await this.markSynced(syncState, { googleEventId, eTag });
    return 'pushed';
  }

  /**
   * Chỉ đánh dấu SYNCED nếu sync state không đổi kể từ lúc đọc.
   * Nếu local vừa bị sửa trong lúc gọi Google (updatedAt đã đổi) thì giữ DIRTY cho lượt sau,
   * nhưng vẫn lưu googleEventId để lượt sau không insert lại.
   */
  private async markSynced(
    syncState: DirtyState,
    googleFields: { googleEventId: string | null; eTag?: string | null },
  ) {
    const marked = await this.prisma.calendarSyncState.updateMany({
      where: { id: syncState.id, updatedAt: syncState.updatedAt },
      data: { ...googleFields, syncStatus: 'SYNCED', lastSyncedAt: new Date() },
    });

    if (marked.count === 0) {
      await this.prisma.calendarSyncState.updateMany({
        where: { id: syncState.id },
        data: googleFields,
      });
    }
  }

  async handleCalendarCronSync() {
    this.logger.log('Bắt đầu Cronjob đồng bộ Google Calendar...');
    try {
      await this.syncLocalToGoogle();
    } catch (error) {
      this.logger.error('Cronjob đồng bộ Google Calendar thất bại:', error);
    }
    this.logger.log('Hoàn thành Cronjob đồng bộ Google Calendar.');
  }
}
