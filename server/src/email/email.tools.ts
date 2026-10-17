import { Injectable } from '@nestjs/common';
import { AiTool } from '../common/decorators/ai-tool.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { SearchEmailsDto } from './dto/search-emails.dto';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

/** Tool chỉ đọc: cho model tra cứu email đã nhận. */
@Injectable()
export class EmailTools {
  constructor(private readonly prisma: PrismaService) {}

  @AiTool({
    name: 'search_emails',
    description:
      'Tra cứu các email đã nhận của người dùng (mới nhất trước). Dùng khi người dùng hỏi về email, thư đã nhận, ai gửi gì, hoặc nội dung tóm tắt của email.',
    dto: SearchEmailsDto,
    parameters: {
      query: {
        type: 'string',
        description:
          'Từ khóa tìm trong người gửi, tiêu đề hoặc tóm tắt email (không phân biệt hoa thường)',
        required: false,
      },
      status: {
        type: 'string',
        description: 'Lọc theo trạng thái xử lý email',
        required: false,
        enum: ['PENDING', 'PROCESSED', 'SKIPPED', 'FAILED'],
      },
      limit: {
        type: 'number',
        description: 'Số email tối đa trả về (mặc định 10, tối đa 20)',
        required: false,
      },
    },
  })
  searchEmails({ query, status, limit }: SearchEmailsDto) {
    const contains = (field: 'sender' | 'subject' | 'aiSummary') => ({
      [field]: { contains: query, mode: 'insensitive' as const },
    });

    return this.prisma.emailLog.findMany({
      where: {
        ...(status && { status }),
        ...(query && {
          OR: [contains('sender'), contains('subject'), contains('aiSummary')],
        }),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT),
      // Không trả rawBody: nội dung email là dữ liệu không tin cậy (có thể chứa prompt injection)
      select: {
        id: true,
        sender: true,
        subject: true,
        aiSummary: true,
        status: true,
        createdAt: true,
      },
    });
  }
}
