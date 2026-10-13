import { Injectable, Logger } from '@nestjs/common';
import { EmailStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailWebhookDto } from './dto/email-webhook.dto';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tính toán SHA-256 Hash để đảm bảo tính Idempotency
   */
  generateDedupHash(messageId: string, rawBody?: string): string {
    const content = `${messageId}:${rawBody || ''}`;
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Tạo bản ghi EmailLog mới ở trạng thái PENDING
   * Nếu dedupHash hoặc messageId đã tồn tại -> Trả về null (Idempotent / Trùng lặp)
   */
  async createEmailLog(dto: EmailWebhookDto) {
    const dedupHash = this.generateDedupHash(dto.messageId, dto.rawBody);

    // Kiểm tra trùng lặp dựa trên dedupHash hoặc messageId
    const existingLog = await this.prisma.emailLog.findFirst({
      where: {
        OR: [{ messageId: dto.messageId }, { dedupHash }],
      },
    });

    if (existingLog) {
      this.logger.warn(
        `Email trùng lặp bị bỏ qua (Message-ID: ${dto.messageId}, Hash: ${dedupHash})`,
      );
      return null;
    }

    return this.prisma.emailLog.create({
      data: {
        messageId: dto.messageId,
        sender: dto.sender,
        subject: dto.subject,
        rawBody: dto.rawBody,
        dedupHash,
        status: EmailStatus.PENDING,
      },
    });
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
