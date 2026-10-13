import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  BadRequestException,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailRuleType, EmailStatus, Prisma } from '@prisma/client';
import { Job } from 'bullmq';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CalendarService } from '../calendar/calendar.service';
import { CreateEventDto } from '../calendar/dto/create-event.dto';
import { CreateTransactionDto } from '../finance/dto/create-transaction.dto';
import { FinanceService } from '../finance/finance.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProactiveTriggerType } from '../proactive/dto/trigger-proactive.dto';
import { ProactiveService } from '../proactive/proactive.service';
import { EmailAiService, EmailClassification } from './email-ai.service';

export interface ProcessEmailJobData {
  emailLogId: string;
  messageId: string;
  sender: string;
  subject?: string;
  rawBody?: string;
  // Đã phân loại lúc tiếp nhận (EmailService.ingest); blacklist không bao giờ tới đây
  ruleType: EmailRuleType | null;
}

const ONE_HOUR_MS = 60 * 60 * 1000;

@Processor('email-processing')
export class EmailProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly emailAiService: EmailAiService,
    private readonly financeService: FinanceService,
    private readonly calendarService: CalendarService,
    private readonly proactiveService: ProactiveService,
  ) {
    super();
  }

  // Không đọc process.env trong @Processor(): decorator chạy lúc import, trước khi ConfigModule nạp .env
  onApplicationBootstrap() {
    this.worker.concurrency = Number(
      this.configService.get('BULLMQ_CONCURRENCY', 3),
    );
  }

  /**
   * Mọi email tới được worker đều được model phân loại (D18); rule chỉ chọn prompt.
   * Hành động do category của model quyết định, không phải rule.
   */
  async process(job: Job<ProcessEmailJobData>): Promise<any> {
    const { emailLogId, ruleType, sender, subject, rawBody } = job.data;
    this.logger.log(`[Job ${job.id}] Đang xử lý email log ID: ${emailLogId}`);

    // Job chạy lại sau khi đã xong: không gọi model và không tạo lại sự kiện
    const emailLog = await this.prisma.emailLog.findUnique({
      where: { id: emailLogId },
      select: { status: true },
    });
    if (emailLog?.status === EmailStatus.PROCESSED) {
      return { success: true, emailLogId, status: EmailStatus.PROCESSED };
    }

    const result = await this.emailAiService.classify(
      { sender, subject, rawBody },
      ruleType,
    );

    if (result.category === 'TRANSACTION' && result.transaction) {
      await this.createTransaction(emailLogId, result);
    } else if (result.category === 'EVENT' && result.event) {
      // shortcut: nếu bước ghi trạng thái ngay dưới đây lỗi, lượt retry tạo trùng sự kiện;
      // nâng khi cần chắc chắn -> thêm local_calendars.email_log_id unique như transactions
      await this.createEvent(emailLogId, result);
    }

    await this.prisma.emailLog.update({
      where: { id: emailLogId },
      data: { status: EmailStatus.PROCESSED, aiSummary: result.summary },
    });

    if (result.urgent) {
      await this.proactiveService.evaluateAndTrigger({
        type: ProactiveTriggerType.URGENT_EVENT,
        message: `Email khẩn từ ${sender}: ${result.summary}`,
        metadata: { emailLogId },
      });
    }

    return {
      success: true,
      emailLogId,
      status: EmailStatus.PROCESSED,
      category: result.category,
    };
  }

  private async toValidDto<T extends object>(
    cls: new () => T,
    plain: Record<string, unknown>,
    emailLogId: string,
  ): Promise<T | null> {
    const dto = plainToInstance(cls, plain);
    const errors = await validate(dto);
    if (errors.length === 0) return dto;

    this.logger.warn(
      `[Email ${emailLogId}] Dữ liệu model trích xuất không hợp lệ (${errors.map((e) => e.property).join(', ')}). Chỉ lưu tóm tắt.`,
    );
    return null;
  }

  private async createTransaction(
    emailLogId: string,
    { transaction, summary }: EmailClassification,
  ) {
    const { accountNumber, bankCode } = transaction!;

    // Không đoán tài khoản: phải khớp đúng một tài khoản đang hoạt động, cùng loại tiền
    const accounts =
      accountNumber || bankCode
        ? await this.prisma.bankAccount.findMany({
            where: {
              isActive: true,
              ...(accountNumber && { accountNumber }),
              ...(bankCode && {
                bankCode: { equals: bankCode, mode: 'insensitive' },
              }),
            },
          })
        : [];
    const account = accounts.length === 1 ? accounts[0] : null;
    if (
      !account ||
      (transaction!.currency &&
        transaction!.currency.toUpperCase() !== account.currency.toUpperCase())
    ) {
      this.logger.warn(
        `[Email ${emailLogId}] Không khớp được đúng một tài khoản cho giao dịch. Chỉ lưu tóm tắt.`,
      );
      return;
    }

    const dto = await this.toValidDto(
      CreateTransactionDto,
      {
        accountId: account.id,
        amount: transaction!.amount,
        type: transaction!.direction,
        counterparty: transaction!.counterparty ?? undefined,
        note: summary,
        transactionTime: transaction!.time ?? new Date(),
        emailLogId,
      },
      emailLogId,
    );
    if (!dto) return;

    try {
      await this.financeService.createTransaction(dto);
    } catch (error) {
      // Retry sau khi giao dịch đã được tạo: unique transactions.email_log_id -> coi như xong
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }
      throw error;
    }
  }

  private async createEvent(
    emailLogId: string,
    { event, summary }: EmailClassification,
  ) {
    const start = new Date(event!.start);
    const dto = await this.toValidDto(
      CreateEventDto,
      {
        title: event!.title,
        description: summary,
        location: event!.location ?? undefined,
        startTime: start,
        endTime: event!.end ?? new Date(start.getTime() + ONE_HOUR_MS),
      },
      emailLogId,
    );
    if (!dto) return;

    try {
      await this.calendarService.createEvent(dto);
    } catch (error) {
      // Khoảng thời gian model trích xuất không hợp lệ (end <= start): không retry
      if (!(error instanceof BadRequestException)) throw error;
      this.logger.warn(
        `[Email ${emailLogId}] Không tạo được sự kiện: ${error.message}`,
      );
    }
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
