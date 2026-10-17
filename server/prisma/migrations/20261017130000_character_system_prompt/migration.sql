-- Hand-written: personas are folded into characters.system_prompt before the table is dropped.
-- Data loss: persona rows lose their id/type/timestamps as separate fields; text is kept as "[TYPE]: value" lines.

ALTER TABLE "characters" ADD COLUMN "slug" TEXT,
ADD COLUMN "system_prompt" TEXT;

CREATE UNIQUE INDEX "characters_slug_key" ON "characters"("slug");

UPDATE "characters" c
SET "system_prompt" = p.txt
FROM (
    SELECT "character_id", string_agg('[' || "type"::text || ']: ' || "value", E'\n' ORDER BY "created_at") AS txt
    FROM "personas"
    GROUP BY "character_id"
) p
WHERE p."character_id" = c."id";

DROP TABLE "personas";

DROP TYPE "PersonaType";
