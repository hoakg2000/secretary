import { GoogleGenAI } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { SaveMemoryDto } from '../../dto/save-memory.dto';
import { SearchMemoryDto } from '../../dto/search-memory.dto';
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

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);
  private readonly ai: GoogleGenAI;

  constructor(private readonly prisma: PrismaService) {
    this.ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || '',
    });
  }

  /**
   * Tạo Vector Embedding 1536 chiều bằng Gemini API
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.ai.models.embedContent({
        model: 'text-embedding-004',
        contents: text,
      });

      const embeddingValues = response.embeddings?.[0]?.values;

      if (!embeddingValues) {
        throw new Error('Không nhận được vector embedding từ Google GenAI API');
      }

      return embeddingValues;
    } catch (error) {
      this.logger.error('Lỗi khi tạo embedding từ Gemini API:', error);
      throw error;
    }
  }

  /**
   * Lưu trữ ký ức AI mới vào Database (cập nhật vector & tsvector)
   */
  async saveMemory(dto: SaveMemoryDto) {
    const embedding = await this.generateEmbedding(dto.content);
    const vectorStr = `[${embedding.join(',')}]`;

    // 1. Tạo bản ghi AiMemory cơ bản
    const memory = await this.prisma.aiMemory.create({
      data: {
        content: dto.content,
        category: dto.category || 'GENERAL',
        source: dto.source || 'MANUAL',
        initialScore: dto.initialScore ?? 1.0,
        decayFactor: dto.decayFactor ?? 0.01,
      },
    });

    // 2. Gọi Raw Query đã tách riêng trong MemoryQueries
    await this.prisma.$executeRaw(
      MemoryQueries.updateVectorAndTsv(memory.id, vectorStr, dto.content),
    );

    return this.prisma.aiMemory.findUnique({ where: { id: memory.id } });
  }

  /**
   * Hybrid Search (pgvector + tsvector) áp dụng công thức Memory Decay S(t) = S0 * e^(-lambda * t)
   */
  async searchMemory(dto: SearchMemoryDto): Promise<MemorySearchResult[]> {
    const limit = dto.limit || 5;
    const queryEmbedding = await this.generateEmbedding(dto.query);
    const vectorStr = `[${queryEmbedding.join(',')}]`;

    // Gọi Raw Query tìm kiếm từ file MemoryQueries
    const results = await this.prisma.$queryRaw<MemorySearchResult[]>(
      MemoryQueries.searchHybridWithDecay(
        vectorStr,
        dto.query,
        limit,
        dto.category,
      ),
    );

    // Cập nhật thời gian truy cập gần nhất (lastAccessedAt)
    if (results.length > 0) {
      const ids = results.map((r) => r.id);
      await this.prisma.aiMemory.updateMany({
        where: { id: { in: ids } },
        data: { lastAccessedAt: new Date() },
      });
    }

    return results;
  }
}
