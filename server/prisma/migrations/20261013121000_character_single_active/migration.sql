-- Hand-written: a partial unique index cannot be expressed in schema.prisma.
-- If a later `prisma migrate dev` generates DROP INDEX "characters_single_active", delete that statement.

-- Keep only the most recently updated active character.
UPDATE "characters" SET "is_active" = false
WHERE "is_active" AND "id" NOT IN (
  SELECT "id" FROM "characters" WHERE "is_active" ORDER BY "updated_at" DESC LIMIT 1
);

-- At most one row may have is_active = true.
CREATE UNIQUE INDEX "characters_single_active" ON "characters" ("is_active") WHERE "is_active";
