import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { EmailRuleType, EmailStatus, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { EmailWebhookDto } from './dto/email-webhook.dto';
import { EmailRuleService } from './email-rule.service';
import type { ProcessEmailJobData } from './email.processor';

// BullMQ: số nhỏ hơn = ưu tiên cao hơn
const JOB_PRIORITY: Record<EmailRuleType | 'none', number> = {
  [EmailRuleType.moneylist]: 1,
  [EmailRuleType.whitelist]: 2,
  [EmailRuleType.blacklist]: 3, // không bao giờ được enqueue
  none: 3,
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailRuleService: EmailRuleService,
    @InjectQueue('email-processing')
    private readonly emailQueue: Queue<ProcessEmailJobData>,
  ) {}

  /**
   * Tạo bản ghi EmailLog mới ở trạng thái PENDING.
   * Chống trùng bằng unique message_id: insert rồi bắt P2002 (không check-then-insert) -> trả về null nếu trùng.
   */
  async createEmailLog(dto: EmailWebhookDto) {
    try {
      return await this.prisma.emailLog.create({
        data: {
          messageId: dto.messageId,
          sender: dto.sender,
          subject: dto.subject,
          rawBody: dto.rawBody,
          status: EmailStatus.PENDING,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.warn(
          `Email trùng lặp bị bỏ qua (Message-ID: ${dto.messageId})`,
        );
        return null;
      }
      throw error;
    }
  }

  /**
   * Tiếp nhận một email: lưu log, phân loại theo rule, rồi
   * blacklist -> SKIPPED (không enqueue); còn lại -> đẩy vào hàng đợi với độ ưu tiên theo rule.
   * Trả về null nếu email đã tồn tại.
   */
  async ingest(dto: EmailWebhookDto) {
    const emailLog = await this.createEmailLog(dto);
    if (!emailLog) {
      return null;
    }

    const ruleType = await this.emailRuleService.classify(emailLog);

    if (ruleType === EmailRuleType.blacklist) {
      await this.updateEmailStatus(emailLog.id, EmailStatus.SKIPPED);
      return {
        emailLogId: emailLog.id,
        jobId: null,
        ruleType,
        status: EmailStatus.SKIPPED,
      };
    }

    const job = await this.emailQueue.add(
      'process-email-job',
      {
        emailLogId: emailLog.id,
        messageId: emailLog.messageId,
        sender: emailLog.sender,
        subject: emailLog.subject ?? undefined,
        rawBody: emailLog.rawBody ?? undefined,
        ruleType,
      },
      {
        jobId: emailLog.id, // một email log = một job, kể cả khi add lại
        priority: JOB_PRIORITY[ruleType ?? 'none'],
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );

    return {
      emailLogId: emailLog.id,
      jobId: job.id ?? null,
      ruleType,
      status: EmailStatus.PENDING,
    };
  }

  /**
   * Cập nhật trạng thái xử lý cho EmailLog
   */
  async updateEmailStatus(id: string, status: EmailStatus) {
    return this.prisma.emailLog.update({
      where: { id },
      data: { status },
    });
  }
}
