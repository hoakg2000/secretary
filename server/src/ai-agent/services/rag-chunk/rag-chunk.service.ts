import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { MemoryService } from '../memory/memory.service';

/**
 * Kept by decision D7. Not called from anywhere and nothing reads rag_chunks yet.
 * syncEmailToMemory stores the raw email body in ai_memories: do not call it from the email worker
 * until the rule in next-steps.md section 6.3 is met (summary only, source excluded from pre-turn retrieval).
 */
@Injectable()
export class RagChunkService {
  private readonly logger = new Logger(RagChunkService.name);
  private readonly textSplitter: RecursiveCharacterTextSplitter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly memoryService: MemoryService,
  ) {
    // Khởi tạo text splitter với kích thước chunk 500 kí tự và overlap 50 kí tự
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 50,
    });
  }

  /**
   * Phân tách tài liệu/văn bản dài thành các đoạn nhỏ (chunks) và lưu vào RagChunk DB
   */
  async splitAndSaveDocument(
    sourceId: string,
    content: string,
    metadata?: Record<string, any>,
  ) {
    try {
      const chunks = await this.textSplitter.splitText(content);

      const createdChunks = await Promise.all(
        chunks.map((chunkText) =>
          this.prisma.ragChunk.create({
            data: {
              sourceId,
              chunkText,
              metadata: metadata || {},
            },
          }),
        ),
      );

      this.logger.log(
        `Đã chunking thành công ${createdChunks.length} đoạn cho sourceId: ${sourceId}`,
      );
      return createdChunks;
    } catch (error) {
      this.logger.error('Lỗi khi thực hiện chunking văn bản:', error);
      throw error;
    }
  }

  /**
   * Đồng bộ một EmailLog đã xử lý vào AI Memory
   */
  async syncEmailToMemory(emailLogId: string) {
    const email = await this.prisma.emailLog.findUnique({
      where: { id: emailLogId },
    });

    if (!email) {
      this.logger.warn(`Không tìm thấy emailLog với ID: ${emailLogId}`);
      return null;
    }

    const memoryContent = `Email từ: ${email.sender} | Tiêu đề: ${email.subject || 'Không có tiêu đề'} | Nội dung: ${email.rawBody || ''}`;

    // 1. Tạo ký ức AI Semantic Memory
    const memory = await this.memoryService.saveMemory({
      content: memoryContent,
      category: 'EMAIL',
      source: 'EMAIL',
      initialScore: 1.0,
      decayFactor: 0.005, // Email giảm điểm chậm hơn
    });

    // 2. Nếu nội dung email dài, tiến hành Chunking lưu vào RagChunk
    if (email.rawBody && email.rawBody.length > 500) {
      await this.splitAndSaveDocument(email.id, email.rawBody, {
        sender: email.sender,
        subject: email.subject,
        type: 'EMAIL',
      });
    }

    return memory;
  }

  /**
   * Đồng bộ một Giao dịch tài chính (Transaction) mới vào AI Memory
   */
  async syncTransactionToMemory(transactionId: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        account: true,
        category: true,
      },
    });

    if (!transaction) {
      this.logger.warn(`Không tìm thấy transaction với ID: ${transactionId}`);
      return null;
    }

    const typeStr = transaction.type === 'INCOME' ? 'Thu nhập' : 'Chi tiêu';
    const memoryContent = `Giao dịch ${typeStr}: ${Number(transaction.amount).toLocaleString('vi-VN')} VND. Tài khoản: ${transaction.account.accountName} (${transaction.account.bankCode}). Danh mục: ${transaction.category?.name || 'Không phân loại'}. Đối tác: ${transaction.counterparty || 'N/A'}. Ghi chú: ${transaction.note || 'N/A'}. Thời gian: ${transaction.transactionTime.toISOString()}`;

    return this.memoryService.saveMemory({
      content: memoryContent,
      category: 'FINANCE',
      source: 'TRANSACTION',
      initialScore: 1.2, // Giao dịch tài chính quan trọng hơn nên gán điểm cao hơn
      decayFactor: 0.002, // Giảm điểm rất chậm
    });
  }
}
