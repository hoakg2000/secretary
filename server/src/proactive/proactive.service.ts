import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AiTool } from '../common/decorators/ai-tool.decorator';
import { PrismaService } from '../prisma/prisma.service';
import {
  ProactiveChannel,
  ProactiveTriggerType,
  TriggerProactiveDto,
} from './dto/trigger-proactive.dto';
import { TelegramClient, TelegramSendStatus } from './telegram.client';

// SENT: Telegram nhận (HTTP 200). FAILED: gọi Telegram lỗi. NOT_CONFIGURED: thiếu bot token hoặc chat ID
export type ProactiveDispatchStatus = TelegramSendStatus;

@Injectable()
export class ProactiveService {
  private readonly logger = new Logger(ProactiveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly telegramClient: TelegramClient,
  ) {}

  /**
   * Chuyển tiếp một thông báo chủ động tới kênh gửi
   */
  async evaluateAndTrigger(dto: TriggerProactiveDto) {
    this.logger.log(
      `[Proactive] Handling trigger: type=${dto.type}, channel=${dto.channel}`,
    );

    const notificationPayload = {
      type: dto.type,
      message: dto.message,
      channel: dto.channel || ProactiveChannel.TELEGRAM,
      metadata: dto.metadata || {},
      timestamp: new Date().toISOString(),
    };

    const sendResult = await this.dispatchNotification(notificationPayload);

    return {
      // Chỉ true khi thông báo thực sự tới được người dùng
      success: sendResult.status === 'SENT',
      channel: notificationPayload.channel,
      payload: notificationPayload,
      result: sendResult,
    };
  }

  /**
   * Gửi thông báo qua Telegram (kênh duy nhất hiện có).
   */
  private async dispatchNotification(payload: {
    type: ProactiveTriggerType;
    message: string;
    channel: ProactiveChannel;
    metadata: Record<string, any>;
    timestamp: string;
  }): Promise<{ status: ProactiveDispatchStatus; at: string }> {
    const status = await this.telegramClient.sendMessage(payload.message);
    this.logger.log(
      `[${payload.channel}] ${status} Proactive message: "${payload.message}"`,
    );

    return { status, at: new Date().toISOString() };
  }

  /**
   * Fallback Cron Job: Chạy định kỳ mỗi 10 phút để nhắc các sự kiện sắp diễn ra trong 15 phút tới.
   * Mỗi sự kiện chỉ được nhắc một lần (reminded_at).
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleFallbackCron() {
    this.logger.log('[Cron] Executing Fallback Proactive Check...');

    const now = new Date();
    const fifteenMinutesLater = new Date(now.getTime() + 15 * 60 * 1000);

    const upcomingEvents = await this.prisma.localCalendar.findMany({
      where: {
        startTime: {
          gte: now,
          lte: fifteenMinutesLater,
        },
        remindedAt: null,
        deletedAt: null,
      },
    });

    const timeZone = this.configService.getOrThrow<string>('APP_TIMEZONE');

    for (const event of upcomingEvents) {
      this.logger.log(
        `[Cron Remind] Upcoming event found: "${event.title}" at ${event.startTime.toISOString()}`,
      );
      const { success } = await this.evaluateAndTrigger({
        type: ProactiveTriggerType.SCHEDULED_REMINDER,
        message: `Nhắc nhở lịch trình: Sắp tới cuộc hẹn "${event.title}" lúc ${event.startTime.toLocaleTimeString('vi-VN', { timeZone })}`,
        channel: ProactiveChannel.TELEGRAM,
        metadata: { eventId: event.id, title: event.title },
      });
      // Gửi chưa thành công thì không đánh dấu: lượt cron sau sẽ thử lại
      if (!success) continue;
      await this.prisma.localCalendar.update({
        where: { id: event.id },
        data: { remindedAt: new Date() },
      });
    }
  }

  // ==========================================
  // REGISTER AI TOOLS FOR FUNCTION CALLING
  // ==========================================

  @AiTool({
    name: 'send_proactive_notification',
    description:
      'Chủ động gửi thông báo / tin nhắn nhắc nhở trực tiếp cho người dùng qua Telegram khi có sự kiện khẩn cấp hoặc tin nhắn cần chú ý.',
    dto: TriggerProactiveDto,
    requiresConfirmation: true,
    parameters: {
      type: {
        type: 'string',
        description:
          'Loại trigger: URGENT_EVENT, INACTIVITY_FALLBACK, SCHEDULED_REMINDER, CUSTOM',
        enum: Object.values(ProactiveTriggerType),
        required: true,
      },
      message: {
        type: 'string',
        description: 'Nội dung thông báo cần gửi đến người dùng',
        required: true,
      },
      channel: {
        type: 'string',
        description: 'Kênh gửi: TELEGRAM',
        enum: Object.values(ProactiveChannel),
        required: false,
      },
    },
  })
  async aiSendProactiveNotification(dto: TriggerProactiveDto) {
    return this.evaluateAndTrigger(dto);
  }
}
