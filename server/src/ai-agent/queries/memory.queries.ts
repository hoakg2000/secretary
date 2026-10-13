import { Prisma } from '@prisma/client';

export interface HybridSearchParams {
  vectorStr: string;
  query: string;
  limit: number;
  minScore: number;
  category?: string;
  source?: string;
}

export class MemoryQueries {
  /**
   * Raw Query cập nhật Vector Embedding và Full-Text Search TSVector cho AiMemory (Prisma v7)
   */
  static updateVectorAndTsv(id: string, vectorStr: string, content: string) {
    return Prisma.sql`
      UPDATE "ai_memories"
      SET
        "embedding" = ${vectorStr}::vector,
        "content_tsv" = to_tsvector('simple', ${content})
      WHERE "id" = ${id}
    `;
  }

  /**
   * Raw Query Hybrid Search kết hợp Vector Similarity (<=>), Full-Text Search (tsvector)
   * và công thức Memory Decay: S(t) = S0 * e^(-lambda * t)
   */
  static searchHybridWithDecay({
    vectorStr,
    query,
    limit,
    minScore,
    category,
    source,
  }: HybridSearchParams) {
    const categoryFilter = category
      ? Prisma.sql`AND category = ${category}`
      : Prisma.empty;
    const sourceFilter = source
      ? Prisma.sql`AND source = ${source}`
      : Prisma.empty;

    return Prisma.sql`
      WITH search_scores AS (
        SELECT
          id,
          content,
          category,
          source,
          created_at,
          last_accessed_at,
          initial_score,
          decay_factor,
          -- Tính Vector Cosine Similarity: 1 - Cosine Distance (<=>)
          (1 - (embedding <=> ${vectorStr}::vector)) AS vector_similarity,
          -- Full-Text Search Rank (simple dictionary). Cờ 32 chuẩn hóa rank/(rank+1) về 0..1
          -- để trọng số 0.3 cùng thang đo với cosine similarity
          ts_rank(content_tsv, plainto_tsquery('simple', ${query}), 32) AS fts_rank,
          -- Tính khoảng thời gian trôi qua t tính theo ngày
          EXTRACT(EPOCH FROM (NOW() - last_accessed_at)) / 86400.0 AS days_elapsed
        FROM "ai_memories"
        WHERE embedding IS NOT NULL
        ${categoryFilter}
        ${sourceFilter}
      )
      SELECT
        id,
        content,
        category,
        source,
        vector_similarity AS "similarity",
        -- Công thức Memory Decay: S(t) = S0 * e^(-lambda * t)
        (initial_score * EXP(-decay_factor * days_elapsed)) AS "decayedScore",
        -- Hybrid Score = (0.7 * Vector + 0.3 * FTS) * Decayed Score
        (((0.7 * vector_similarity) + (0.3 * COALESCE(fts_rank, 0))) * (initial_score * EXP(-decay_factor * days_elapsed))) AS "finalScore",
        created_at AS "createdAt",
        last_accessed_at AS "lastAccessedAt"
      FROM search_scores
      -- Ngưỡng liên quan tối thiểu: ký ức không liên quan không được trả về (và không bị làm mới last_accessed_at)
      WHERE vector_similarity >= ${minScore}
      ORDER BY "finalScore" DESC
      LIMIT ${limit};
    `;
  }
}
