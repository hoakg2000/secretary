-- Nullable: USER messages and pre-existing MODEL messages have no Japanese text.
ALTER TABLE "chat_messages" ADD COLUMN "content_jp" TEXT;
