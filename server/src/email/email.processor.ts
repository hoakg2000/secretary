import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailRuleType, EmailStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

export interface ProcessEmailJobData {
  emailLogId: string;
  messageId: string;
  sender: string;
  subject?: string;
  rawBody?: string;
  // Đã phân loại lúc tiếp nhận (EmailService.ingest); blacklist không bao giờ tới đây
  ruleType: EmailRuleType | null;
}

@Processor('email-processing')
export class EmailProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  // Không đọc process.env trong @Processor(): decorator chạy lúc import, trước khi ConfigModule nạp .env
  onApplicationBootstrap() {
    this.worker.concurrency = Number(
      this.configService.get('BULLMQ_CONCURRENCY', 3),
    );
  }

  async process(job: Job<ProcessEmailJobData>): Promise<any> {
    const { emailLogId, ruleType } = job.data;
    this.logger.log(`[Job ${job.id}] Đang xử lý email log ID: ${emailLogId}`);

    let finalStatus: EmailStatus = EmailStatus.SKIPPED;

    if (ruleType === EmailRuleType.moneylist) {
      finalStatus = EmailStatus.PROCESSED;
      this.logger.log(
        `[Job ${job.id}] Email phân loại Moneylist -> Sẵn sàng trích xuất giao dịch tài chính`,
      );
      // TODO: trích xuất giao dịch bằng AI (plan 6.3)
    } else if (ruleType === EmailRuleType.whitelist) {
      finalStatus = EmailStatus.PROCESSED;
      this.logger.log(
        `[Job ${job.id}] Email phân loại Whitelist -> Sẵn sàng trích xuất thông tin lịch/tóm tắt`,
      );
      // TODO: phân loại / tóm tắt bằng AI (plan 6.3)
    } else {
      this.logger.log(
        `[Job ${job.id}] Email không khớp với quy tắc nào -> Đặt trạng thái SKIPPED`,
      );
    }

    await this.prisma.emailLog.update({
      where: { id: emailLogId },
      data: { status: finalStatus },
    });

    return { success: true, emailLogId, status: finalStatus };
  }

  /**
   * Chỉ đánh dấu FAILED khi đã hết số lần retry. Lỗi của chính bước ghi DB này chỉ được log,
   * không che mất lỗi gốc của job.
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<ProcessEmailJobData> | undefined, error: Error) {
    if (!job) return;

    this.logger.error(
      `[Job ${job.id}] Xử lý email thất bại (lần ${job.attemptsMade}): ${error.message}`,
      error.stack,
    );

    if (job.attemptsMade < (job.opts.attempts ?? 1)) return;

    try {
      await this.prisma.emailLog.update({
        where: { id: job.data.emailLogId },
        data: { status: EmailStatus.FAILED },
      });
    } catch (updateError: any) {
      this.logger.error(
        `[Job ${job.id}] Không cập nhật được trạng thái FAILED: ${updateError.message}`,
      );
    }
  }
}
