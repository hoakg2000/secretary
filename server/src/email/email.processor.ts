import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { EmailMatcher, EmailRuleType, EmailStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

export interface ProcessEmailJobData {
  emailLogId: string;
  messageId: string;
  sender: string;
  subject?: string;
  rawBody?: string;
}

@Processor('email-processing')
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<ProcessEmailJobData>): Promise<any> {
    const { emailLogId, sender, subject, rawBody } = job.data;
    this.logger.log(`[Job ${job.id}] Đang xử lý email log ID: ${emailLogId}`);

    try {
      // 1. Lấy tất cả các quy tắc lọc email đang hoạt động
      const rules = await this.prisma.emailRule.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      });

      // 2. Tìm quy tắc trùng khớp đầu tiên
      let matchedRuleType: EmailRuleType | null = null;

      for (const rule of rules) {
        if (this.isMatched(rule, sender, subject, rawBody)) {
          matchedRuleType = rule.type;
          this.logger.log(
            `[Job ${job.id}] Khớp quy tắc (${rule.type}): ${rule.matchValue}`,
          );
          break;
        }
      }

      // 3. Xử lý dựa trên quy tắc khớp
      let finalStatus: EmailStatus = EmailStatus.SKIPPED;

      if (matchedRuleType === EmailRuleType.blacklist) {
        finalStatus = EmailStatus.SKIPPED;
        this.logger.warn(
          `[Job ${job.id}] Email bị bỏ qua do nằm trong Blacklist`,
        );
      } else if (matchedRuleType === EmailRuleType.moneylist) {
        finalStatus = EmailStatus.PROCESSED;
        this.logger.log(
          `[Job ${job.id}] Email phân loại Moneylist -> Sẵn sàng trích xuất giao dịch tài chính`,
        );
        // TODO: Gọi hook hoặc bắn event tới Finance Module ở Bước 4
      } else if (matchedRuleType === EmailRuleType.whitelist) {
        finalStatus = EmailStatus.PROCESSED;
        this.logger.log(
          `[Job ${job.id}] Email phân loại Whitelist -> Sẵn sàng trích xuất thông tin lịch/tóm tắt`,
        );
        // TODO: Gọi AI extraction hoặc lưu vào AI Memory ở Bước 6
      } else {
        this.logger.log(
          `[Job ${job.id}] Email không khớp với quy tắc nào -> Đặt trạng thái SKIPPED`,
        );
      }

      // 4. Cập nhật trạng thái vào bảng email_logs
      await this.prisma.emailLog.update({
        where: { id: emailLogId },
        data: { status: finalStatus },
      });

      return { success: true, emailLogId, status: finalStatus };
    } catch (error: any) {
      this.logger.error(
        `[Job ${job.id}] Xử lý email thất bại: ${error.message}`,
        error.stack,
      );

      await this.prisma.emailLog.update({
        where: { id: emailLogId },
        data: { status: EmailStatus.FAILED },
      });

      throw error;
    }
  }

  /**
   * Helper kiểm tra giá trị email có khớp với Rule hay không
   */
  private isMatched(
    rule: { matcher: EmailMatcher; matchValue: string },
    sender: string,
    subject?: string,
    rawBody?: string,
  ): boolean {
    const { matcher, matchValue } = rule;
    const targetText = matchValue.toLowerCase();

    switch (matcher) {
      case EmailMatcher.sender:
        return sender.toLowerCase().includes(targetText);

      case EmailMatcher.keyword: {
        const fullContent = `${subject || ''} ${rawBody || ''}`.toLowerCase();
        return fullContent.includes(targetText);
      }

      case EmailMatcher.regex: {
        try {
          const regex = new RegExp(matchValue, 'i');
          const fullContent = `${sender} ${subject || ''} ${rawBody || ''}`;
          return regex.test(fullContent);
        } catch (e) {
          this.logger.error(`Regex không hợp lệ: ${matchValue}`);
          return false;
        }
      }

      default:
        return false;
    }
  }
}
