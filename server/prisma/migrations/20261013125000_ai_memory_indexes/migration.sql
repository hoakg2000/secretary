-- Hand-written: HNSW and GIN indexes on Unsupported columns cannot be expressed in schema.prisma.
-- If a later `prisma migrate dev` generates DROP INDEX for either of them, delete that statement.

-- Before trusting search results, this should return 0 (rows embedded with the old 768-dimension model
-- could never be saved; if any exist they must be re-embedded):
--   SELECT count(*) FROM ai_memories WHERE embedding IS NOT NULL;

-- Vector similarity (cosine), matches the <=> operator used in memory.queries.ts
CREATE INDEX "ai_memories_embedding_hnsw" ON "ai_memories" USING hnsw ("embedding" vector_cosine_ops);

-- Full-text search
CREATE INDEX "ai_memories_content_tsv_gin" ON "ai_memories" USING gin ("content_tsv");
