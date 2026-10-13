-- Before applying, this must return no rows (the unique index below fails otherwise):
--   SELECT email_log_id, count(*) FROM transactions WHERE email_log_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_account_id_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "transactions_email_log_id_key" ON "transactions"("email_log_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
