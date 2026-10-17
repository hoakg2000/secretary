-- Hand-edited: removed generated DROP INDEX for ai_memories_embedding_hnsw / ai_memories_content_tsv_gin (exist only in migrations).
-- Data loss: drops the active flag; the client now picks the character.

DROP INDEX IF EXISTS "characters_single_active";
ALTER TABLE "characters" DROP COLUMN "is_active";
