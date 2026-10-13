import { Injectable, Logger } from '@nestjs/common';
import { AiTool } from '../../common/decorators/ai-tool.decorator';
import { MemoryService } from '../services/memory/memory.service';

@Injectable()
export class MemoryTools {
  private readonly logger = new Logger(MemoryTools.name);

  constructor(private readonly memoryService: MemoryService) {}

  @AiTool({
    name: 'search_semantic_memory',
    description:
      'Tra cứu bộ nhớ ngữ nghĩa của AI về thông tin, thói quen, sở thích, sự kiện hoặc chi tiết cá nhân của người dùng.',
    parameters: {
      query: {
        type: 'string',
        description: 'Từ khóa hoặc câu hỏi tìm kiếm ngữ nghĩa trong ký ức',
        required: true,
      },
      category: {
        type: 'string',
        description:
          'Phân loại ký ức cần tìm (ví dụ: PREFERENCE, FACT, EVENT, EMAIL, FINANCE)',
        required: false,
      },
      limit: {
        type: 'number',
        description: 'Số lượng kết quả ký ức tối đa trả về (mặc định là 5)',
        required: false,
      },
    },
  })
  async searchSemanticMemory(params: {
    query: string;
    category?: string;
    limit?: number;
  }) {
    this.logger.log(
      `[AiTool: search_semantic_memory] Query: "${params.query}"`,
    );
    return this.memoryService.searchMemory({
      query: params.query,
      category: params.category,
      limit: params.limit || 5,
    });
  }

  @AiTool({
    name: 'save_user_memory',
    description:
      'Lưu thông tin mới, sở thích, thói quen hoặc dữ liệu quan trọng của người dùng vào bộ nhớ AI dài hạn.',
    parameters: {
      content: {
        type: 'string',
        description: 'Nội dung chi tiết thông tin/ký ức cần lưu trữ',
        required: true,
      },
      category: {
        type: 'string',
        description: 'Phân loại ký ức (PREFERENCE, FACT, EVENT, GENERAL)',
        required: false,
      },
      initialScore: {
        type: 'number',
        description:
          'Điểm mức độ quan trọng ban đầu (1.0 là mặc định, > 1.0 với thông tin rất quan trọng)',
        required: false,
      },
    },
  })
  async saveUserMemory(params: {
    content: string;
    category?: string;
    initialScore?: number;
  }) {
    this.logger.log(`[AiTool: save_user_memory] Content: "${params.content}"`);
    return this.memoryService.saveMemory({
      content: params.content,
      category: params.category || 'GENERAL',
      source: 'CHAT',
      initialScore: params.initialScore ?? 1.0,
      decayFactor: 0.01,
    });
  }
}
