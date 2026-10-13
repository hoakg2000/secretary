-- DropForeignKey
ALTER TABLE "memory_decay_logs" DROP CONSTRAINT "memory_decay_logs_memory_id_fkey";

-- DropTable
DROP TABLE "memory_decay_logs";
