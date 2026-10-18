import { Injectable, NotFoundException } from '@nestjs/common';
import { ChatRole, Prisma } from '@prisma/client';
import { LlmMessage } from '../../../llm/llm.types';
import { paginate } from '../../../common/pagination';
import { PrismaService } from '../../../prisma/prisma.service';

/** Độ dài tối đa của tiêu đề phiên (cắt từ tin nhắn đầu tiên) */
const SESSION_TITLE_MAX = 80;

/** Số tin nhắn lịch sử gửi kèm cho model */
const HISTORY_LIMIT = 20;

/**
 * Phiên chat và tin nhắn (D19): chỉ bảng quan hệ, không bao giờ embedding / vector.
 */
@Injectable()
export class ChatSessionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Tạo phiên mới; tiêu đề lấy từ đầu tin nhắn đầu tiên */
  create(userId: string, characterId: string | null, title: string) {
    return this.prisma.chatSession.create({
      data: { userId, characterId, title: title.slice(0, SESSION_TITLE_MAX) },
    });
  }

  /** Phiên phải thuộc về user, nếu không thì 404 */
  async findOwn(userId: string, sessionId: string) {
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
    limit = HISTORY_LIMIT,
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
  async listSessions(userId: string, page?: number, pageSize?: number) {
    const where = { userId };
    return paginate(
      { page, pageSize },
      (range) =>
        this.prisma.chatSession.findMany({
          where,
          orderBy: { lastMessageAt: 'desc' },
          ...range,
        }),
      () => this.prisma.chatSession.count({ where }),
    );
  }

  /** Tin nhắn của một phiên thuộc về user, cũ trước */
  async listMessages(
    userId: string,
    sessionId: string,
    page?: number,
    pageSize?: number,
  ) {
    await this.findOwn(userId, sessionId);

    const where = { sessionId };
    return paginate(
      { page, pageSize },
      (range) =>
        this.prisma.chatMessage.findMany({
          where,
          orderBy: { createdAt: 'asc' },
          ...range,
        }),
      () => this.prisma.chatMessage.count({ where }),
    );
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
