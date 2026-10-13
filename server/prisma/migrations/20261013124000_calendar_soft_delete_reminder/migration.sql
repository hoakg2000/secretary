-- AlterTable
ALTER TABLE "local_calendars" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "reminded_at" TIMESTAMP(3);
