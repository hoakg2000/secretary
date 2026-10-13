-- Existing refresh tokens have no session to bind to: every login is ended by this migration.
DELETE FROM "refresh_tokens";

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "session_id" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "refresh_tokens_session_id_idx" ON "refresh_tokens"("session_id");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "user_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
