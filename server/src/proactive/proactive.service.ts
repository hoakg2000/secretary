import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AiTool } from '../common/decorators/ai-tool.decorator';
import { PrismaService } from '../prisma/prisma.service';
import {
  ProactiveChannel,
  ProactiveTriggerType,
  TriggerProactiveDto,
} from './dto/trigger-proactive.dto';

@Injectable()
export class ProactiveService {
  private readonly logger = new Logger(ProactiveService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Đánh giá ngữ cảnh và gửi thông báo chủ động
   */
  async evaluateAndTrigger(dto: TriggerProactiveDto) {
    this.logger.log(
      `[Proactive] Handling trigger: type=${dto.type}, channel=${dto.channel}`,
    );

    // 1. Log / Lưu lại vết trigger hoặc xử lý theo loại trigger
    const notificationPayload = {
      type: dto.type,
      message: dto.message,
      channel: dto.channel || ProactiveChannel.TELEGRAM,
      metadata: dto.metadata || {},
      timestamp: new Date().toISOString(),
    };

    // 2. Phân tuyến kênh gửi thông báo
    const sendResult = await this.dispatchNotification(notificationPayload);

    return {
      success: true,
      deliveredChannel: dto.channel,
      payload: notificationPayload,
      result: sendResult,
    };
  }

  /**
   * Điều phối gửi thông báo đến các kênh (Telegram / Push Notification)
   */
  private async dispatchNotification(payload: {
    type: ProactiveTriggerType;
    message: string;
    channel: ProactiveChannel;
    metadata: Record<string, any>;
    timestamp: string;
  }) {
    // Demo giả lập dispatching notification
    if (
      payload.channel === ProactiveChannel.TELEGRAM ||
      payload.channel === ProactiveChannel.ALL
    ) {
      this.logger.log(
        `[Telegram Bot] Sending proactive message: "${payload.message}"`,
      );
    }

    if (
      payload.channel === ProactiveChannel.PUSH_NOTIFICATION ||
      payload.channel === ProactiveChannel.ALL
    ) {
      this.logger.log(
        `[Push Notification] Sending notification: "${payload.message}"`,
      );
    }

    return { status: 'SENT', sentAt: new Date().toISOString() };
  }

  /**
   * Fallback Cron Job: Chạy định kỳ mỗi 10 phút để rà soát sự kiện / lịch trình sắp diễn ra
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleFallbackCron() {
    this.logger.log('[Cron] Executing Fallback Proactive Check...');

    const now = new Date();
    const fifteenMinutesLater = new Date(now.getTime() + 15 * 60 * 1000);

    // Rà soát lịch cục bộ sắp diễn ra trong 15 phút tới
    const upcomingEvents = await this.prisma.localCalendar.findMany({
      where: {
        startTime: {
          gte: now,
          lte: fifteenMinutesLater,
        },
      },
    });

    if (upcomingEvents.length > 0) {
      for (const event of upcomingEvents) {
        this.logger.log(
          `[Cron Remind] Upcoming event found: "${event.title}" at ${event.startTime}`,
        );
        await this.evaluateAndTrigger({
          type: ProactiveTriggerType.SCHEDULED_REMINDER,
          message: `Nhắc nhở lịch trình: Sắp tới cuộc hẹn "${event.title}" lúc ${new Date(event.startTime).toLocaleTimeString('vi-VN')}`,
          channel: ProactiveChannel.TELEGRAM,
          metadata: { eventId: event.id, title: event.title },
        });
      }
    }
  }

  // ==========================================
  // REGISTER AI TOOLS FOR FUNCTION CALLING
  // ==========================================

  @AiTool({
    name: 'send_proactive_notification',
    description:
      'Chủ động gửi thông báo / tin nhắn nhắc nhở trực tiếp cho người dùng qua Telegram hoặc Push Notification khi có sự kiện khẩn cấp hoặc tin nhắn cần chú ý.',
    parameters: {
      type: {
        type: 'string',
        description:
          'Loại trigger: URGENT_EVENT, INACTIVITY_FALLBACK, SCHEDULED_REMINDER, CUSTOM',
        enum: [
          'URGENT_EVENT',
          'INACTIVITY_FALLBACK',
          'SCHEDULED_REMINDER',
          'CUSTOM',
        ],
        required: true,
      },
      message: {
        type: 'string',
        description: 'Nội dung thông báo cần gửi đến người dùng',
        required: true,
      },
      channel: {
        type: 'string',
        description: 'Kênh gửi: TELEGRAM, PUSH_NOTIFICATION, hoặc ALL',
        enum: ['TELEGRAM', 'PUSH_NOTIFICATION', 'ALL'],
        required: false,
      },
    },
  })
  async aiSendProactiveNotification(params: {
    type: ProactiveTriggerType;
    message: string;
    channel?: ProactiveChannel;
  }) {
    return this.evaluateAndTrigger({
      type: params.type,
      message: params.message,
      channel: params.channel ?? ProactiveChannel.TELEGRAM,
    });
  }
}
