import { Prisma } from '@prisma/client';

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
  static searchHybridWithDecay(
    vectorStr: string,
    query: string,
    limit: number,
    category?: string,
  ) {
    const categoryFilter = category
      ? Prisma.sql`AND category = ${category}`
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
          -- Tính Full-Text Search Rank với simple dictionary
          ts_rank(content_tsv, plainto_tsquery('simple', ${query})) AS fts_rank,
          -- Tính khoảng thời gian trôi qua t tính theo ngày
          EXTRACT(EPOCH FROM (NOW() - last_accessed_at)) / 86400.0 AS days_elapsed
        FROM "ai_memories"
        WHERE embedding IS NOT NULL
        ${categoryFilter}
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
      ORDER BY "finalScore" DESC
      LIMIT ${limit};
    `;
  }
}
