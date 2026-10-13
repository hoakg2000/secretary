import { NotFoundException } from '@nestjs/common';
import { ChatSessionService } from './chat-session.service';

function build() {
  const prisma: any = {
    chatSession: {
      create: vi.fn(async ({ data }: any) => ({ id: 's1', ...data })),
      findFirst: vi.fn().mockResolvedValue(null),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    chatMessage: { findMany: vi.fn().mockResolvedValue([]) },
  };
  return { prisma, service: new ChatSessionService(prisma) };
}

describe('ChatSessionService', () => {
  it('creates a session titled with the first 80 characters of the first message', async () => {
    const { service, prisma } = build();

    await service.resolve('user-1', undefined, 'c1', 'a'.repeat(100));

    expect(prisma.chatSession.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', characterId: 'c1', title: 'a'.repeat(80) },
    });
  });

  it("resolve throws NotFoundException for another user's session", async () => {
    const { service, prisma } = build();

    await expect(service.resolve('user-2', 's1')).rejects.toBeInstanceOf(NotFoundException);

    // quyền sở hữu nằm trong điều kiện truy vấn
    expect(prisma.chatSession.findFirst).toHaveBeenCalledWith({ where: { id: 's1', userId: 'user-2' } });
    expect(prisma.chatSession.create).not.toHaveBeenCalled();
  });

  it('recentHistory returns oldest first, skips empty content and a leading model row', async () => {
    const { service, prisma } = build();
    // Prisma trả về mới nhất trước
    prisma.chatMessage.findMany.mockResolvedValue([
      { role: 'MODEL', content: 'Chào Hoa' },
      { role: 'MODEL', content: '' },
      { role: 'USER', content: 'Tên tôi là Hoa' },
      { role: 'MODEL', content: 'câu trả lời mồ côi' },
    ]);

    expect(await service.recentHistory('s1', 'u9')).toEqual([
      { role: 'user', parts: [{ text: 'Tên tôi là Hoa' }] },
      { role: 'model', parts: [{ text: 'Chào Hoa' }] },
    ]);
    expect(prisma.chatMessage.findMany.mock.calls[0][0]).toMatchObject({
      where: { sessionId: 's1' },
      cursor: { id: 'u9' },
      skip: 1,
      take: 20,
    });
  });

  it("deleteSession throws NotFoundException for another user's session", async () => {
    const { service, prisma } = build();

    await expect(service.deleteSession('user-2', 's1')).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.chatSession.deleteMany).toHaveBeenCalledWith({ where: { id: 's1', userId: 'user-2' } });
  });
});
