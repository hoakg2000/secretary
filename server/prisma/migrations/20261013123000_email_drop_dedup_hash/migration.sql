-- DropIndex
DROP INDEX "email_logs_dedup_hash_key";

-- AlterTable
ALTER TABLE "email_logs" DROP COLUMN "dedup_hash";
