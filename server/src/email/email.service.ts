import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EmailLog, EmailRuleType, EmailStatus, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { EmailWebhookDto } from './dto/email-webhook.dto';
import { ListEmailLogDto } from './dto/list-email-log.dto';
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
    let emailLog = await this.createEmailLog(dto);
    if (!emailLog) {
      // Trùng nhưng còn PENDING: lần trước có thể lỗi sau khi insert, trước khi enqueue -> enqueue lại.
      // An toàn vì jobId = email log ID: job đang tồn tại thì BullMQ bỏ qua lần add này
      const existing = await this.prisma.emailLog.findUnique({
        where: { messageId: dto.messageId },
      });
      if (existing?.status !== EmailStatus.PENDING) {
        return null;
      }
      emailLog = existing;
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

    const job = await this.enqueue(emailLog, ruleType);

    return {
      emailLogId: emailLog.id,
      jobId: job.id ?? null,
      ruleType,
      status: EmailStatus.PENDING,
    };
  }

  private enqueue(emailLog: EmailLog, ruleType: EmailRuleType | null) {
    return this.emailQueue.add(
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
  }

  /** Danh sách email log, mới nhất trước */
  async listLogs(dto: ListEmailLogDto) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const where = { ...(dto.status && { status: dto.status }) };

    const [items, total] = await Promise.all([
      this.prisma.emailLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.emailLog.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  /** Xử lý lại một email FAILED: phân loại lại rồi đưa vào hàng đợi (hoặc SKIPPED nếu khớp blacklist) */
  async reprocess(id: string) {
    const emailLog = await this.prisma.emailLog.findUnique({ where: { id } });
    if (!emailLog) {
      throw new NotFoundException(`Không tìm thấy email log với ID: ${id}`);
    }

    const claimed = await this.prisma.emailLog.updateMany({
      where: { id, status: EmailStatus.FAILED },
      data: { status: EmailStatus.PENDING },
    });
    if (claimed.count === 0) {
      throw new BadRequestException(
        'Chỉ xử lý lại được email ở trạng thái FAILED',
      );
    }

    try {
      // Job lỗi cũ vẫn được giữ (removeOnFail) với cùng jobId -> add sẽ bị bỏ qua nếu không xóa
      await (await this.emailQueue.getJob(id))?.remove();

      const ruleType = await this.emailRuleService.classify(emailLog);
      if (ruleType === EmailRuleType.blacklist) {
        await this.updateEmailStatus(id, EmailStatus.SKIPPED);
        return {
          emailLogId: id,
          jobId: null,
          ruleType,
          status: EmailStatus.SKIPPED,
        };
      }

      const job = await this.enqueue(emailLog, ruleType);
      return {
        emailLogId: id,
        jobId: job.id ?? null,
        ruleType,
        status: EmailStatus.PENDING,
      };
    } catch (error) {
      // Trả về FAILED để có thể reprocess lại, tránh kẹt PENDING không có job
      await this.updateEmailStatus(id, EmailStatus.FAILED).catch((e) =>
        this.logger.error(`Không đặt lại FAILED cho email log ${id}:`, e),
      );
      throw error;
    }
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
