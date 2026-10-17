import { Injectable, NotFoundException } from '@nestjs/common';
import { ChatRole, Prisma } from '@prisma/client';
import { LlmMessage } from '../../../llm/llm.types';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Phiên chat và tin nhắn (D19): chỉ bảng quan hệ, không bao giờ embedding / vector.
 */
@Injectable()
export class ChatSessionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Không có sessionId: tạo phiên mới. Có sessionId: phiên phải thuộc về user, nếu không thì 404 */
  async resolve(
    userId: string,
    sessionId?: string,
    characterId?: string | null,
    firstMessage = '',
  ) {
    if (!sessionId) {
      return this.prisma.chatSession.create({
        data: { userId, characterId, title: firstMessage.slice(0, 80) },
      });
    }

    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
    });
    // Cùng một câu trả lời cho "không tồn tại" và "không phải của bạn"
    if (!session) {
      throw new NotFoundException(
        `Không tìm thấy phiên chat với ID: ${sessionId}`,
      );
    }
    return session;
  }

  /** Lưu nguyên văn một tin nhắn và cập nhật lastMessageAt của phiên */
  async appendMessage(
    sessionId: string,
    role: ChatRole,
    content: string,
    toolCalls?: Prisma.InputJsonValue,
    contentJp?: string,
  ) {
    const [message] = await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: { sessionId, role, content, toolCalls, contentJp },
      }),
      this.prisma.chatSession.update({
        where: { id: sessionId },
        data: { lastMessageAt: new Date() },
      }),
    ]);
    return message;
  }

  /** Các tin nhắn gần nhất trước một tin nhắn, cũ trước, dạng LlmMessage trung lập */
  async recentHistory(
    sessionId: string,
    beforeMessageId: string,
    limit = 20,
  ): Promise<LlmMessage[]> {
    const rows = await this.prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      cursor: { id: beforeMessageId },
      skip: 1,
      take: limit,
    });

    const turns = rows
      .reverse()
      .filter((row) => row.content)
      .map((row): LlmMessage => ({
        role: row.role === ChatRole.USER ? 'user' : 'assistant',
        content: row.content,
      }));

    // History phải bắt đầu bằng lượt của người dùng
    const firstUser = turns.findIndex((turn) => turn.role === 'user');
    return firstUser === -1 ? [] : turns.slice(firstUser);
  }

  linkMemory(messageId: string, memoryId: string) {
    return this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { memoryId },
    });
  }

  /** Danh sách phiên chat của user, phiên có tin nhắn mới nhất trước */
  async listSessions(userId: string, page = 1, pageSize = 20) {
    const where = { userId };
    const [items, total] = await Promise.all([
      this.prisma.chatSession.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.chatSession.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  /** Tin nhắn của một phiên thuộc về user, cũ trước */
  async listMessages(
    userId: string,
    sessionId: string,
    page = 1,
    pageSize = 20,
  ) {
    await this.resolve(userId, sessionId);

    const where = { sessionId };
    const [items, total] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.chatMessage.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  /** Tin nhắn thuộc phiên của user (kèm Character của phiên); 404 nếu không có hoặc của người khác */
  async findOwnMessage(userId: string, messageId: string) {
    const message = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, session: { userId } },
      include: { session: { include: { character: true } } },
    });
    if (!message) {
      throw new NotFoundException(
        `Không tìm thấy tin nhắn với ID: ${messageId}`,
      );
    }
    return message;
  }

  /** Xóa phiên (tin nhắn xóa theo, ký ức đã tạo từ chúng được giữ lại) */
  async deleteSession(userId: string, sessionId: string) {
    const deleted = await this.prisma.chatSession.deleteMany({
      where: { id: sessionId, userId },
    });
    if (deleted.count === 0) {
      throw new NotFoundException(
        `Không tìm thấy phiên chat với ID: ${sessionId}`,
      );
    }
    return { success: true };
  }
}
