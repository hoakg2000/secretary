import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { paginate } from '../../../common/pagination';
import { PrismaService } from '../../../prisma/prisma.service';
import { ListMemoryDto } from '../../dto/list-memory.dto';
import { SaveMemoryDto } from '../../dto/save-memory.dto';
import { SearchMemoryDto } from '../../dto/search-memory.dto';
import { UpdateMemoryDto } from '../../dto/update-memory.dto';
import { GenAiProvider } from '../../genai.provider';
import { MemoryQueries } from '../../queries/memory.queries';

export interface MemorySearchResult {
  id: string;
  content: string;
  category: string | null;
  source: string | null;
  similarity: number;
  decayedScore: number;
  finalScore: number;
  createdAt: Date;
  lastAccessedAt: Date;
}

// Phải khớp với cột ai_memories.embedding vector(1536)
const EMBEDDING_DIMENSIONS = 1536;

type EmbeddingTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly genAi: GenAiProvider,
  ) {}

  /**
   * Tạo Vector Embedding 1536 chiều bằng Gemini API
   */
  async generateEmbedding(
    text: string,
    taskType: EmbeddingTaskType,
  ): Promise<number[]> {
    const response = await this.genAi.get().models.embedContent({
      model: this.configService.get<string>(
        'GEMINI_EMBEDDING_MODEL',
        'gemini-embedding-001',
      ),
      contents: text,
      config: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType },
    });

    const values = response.embeddings?.[0]?.values;

    if (values?.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Embedding phải có ${EMBEDDING_DIMENSIONS} chiều, nhận được ${values?.length ?? 0}`,
      );
    }

    return values;
  }

  /**
   * Lưu trữ ký ức AI mới vào Database (cập nhật vector & tsvector)
   */
  async saveMemory(dto: SaveMemoryDto) {
    const embedding = await this.generateEmbedding(
      dto.content,
      'RETRIEVAL_DOCUMENT',
    );
    const vectorStr = MemoryQueries.toVector(embedding);

    // Một transaction: không để lại bản ghi thiếu vector nếu bước ghi embedding lỗi
    const memory = await this.prisma.$transaction(async (tx) => {
      const created = await tx.aiMemory.create({
        data: {
          content: dto.content,
          category: dto.category || 'GENERAL',
          source: dto.source || 'MANUAL',
          initialScore: dto.initialScore ?? 1.0,
          decayFactor: dto.decayFactor ?? 0.01,
        },
      });

      await tx.$executeRaw(
        MemoryQueries.updateVectorAndTsv(created.id, vectorStr, dto.content),
      );

      return created;
    });

    return memory;
  }

  /**
   * Hybrid Search (pgvector + tsvector) áp dụng công thức Memory Decay S(t) = S0 * e^(-lambda * t)
   */
  async searchMemory(dto: SearchMemoryDto): Promise<MemorySearchResult[]> {
    const queryEmbedding = await this.generateEmbedding(
      dto.query,
      'RETRIEVAL_QUERY',
    );

    const results = await this.prisma.$queryRaw<MemorySearchResult[]>(
      MemoryQueries.searchHybridWithDecay({
        vectorStr: MemoryQueries.toVector(queryEmbedding),
        query: dto.query,
        limit: dto.limit ?? 5,
        // shortcut: ngưỡng 0.5 chưa được hiệu chỉnh với dữ liệu thật; chỉnh lại khi có ký ức thật
        minScore: dto.minScore ?? 0.5,
        category: dto.category,
        source: dto.source,
      }),
    );

    // Chỉ các ký ức vượt ngưỡng (được trả về) mới được làm mới lastAccessedAt
    if (results.length > 0) {
      const ids = results.map((r) => r.id);
      await this.prisma.aiMemory.updateMany({
        where: { id: { in: ids } },
        data: { lastAccessedAt: new Date() },
      });
    }

    return results;
  }

  /** Danh sách ký ức, mới nhất trước */
  async listMemories(dto: ListMemoryDto) {
    const where = {
      ...(dto.category && { category: dto.category }),
      ...(dto.source && { source: dto.source }),
    };

    return paginate(
      dto,
      (range) =>
        this.prisma.aiMemory.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          ...range,
        }),
      () => this.prisma.aiMemory.count({ where }),
    );
  }

  /** Sửa nội dung/phân loại; đổi nội dung thì embedding + tsvector được tạo lại */
  async updateMemory(id: string, dto: UpdateMemoryDto) {
    const existing = await this.prisma.aiMemory.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy ký ức với ID: ${id}`);
    }
    // content null (IsOptional cho qua) = không đổi; category null = xóa phân loại (cột nullable)
    const data = { content: dto.content ?? undefined, category: dto.category };

    if (dto.content == null) {
      return this.prisma.aiMemory.update({ where: { id }, data });
    }

    // Gọi API embedding ngoài transaction để không giữ kết nối DB khi chờ mạng
    const embedding = await this.generateEmbedding(
      dto.content,
      'RETRIEVAL_DOCUMENT',
    );
    const vectorStr = MemoryQueries.toVector(embedding);
    const content = dto.content;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.aiMemory.update({ where: { id }, data });
      await tx.$executeRaw(
        MemoryQueries.updateVectorAndTsv(id, vectorStr, content),
      );
      return updated;
    });
  }

  async deleteMemory(id: string) {
    const deleted = await this.prisma.aiMemory.deleteMany({ where: { id } });
    if (deleted.count === 0) {
      throw new NotFoundException(`Không tìm thấy ký ức với ID: ${id}`);
    }
    return { success: true };
  }
}
