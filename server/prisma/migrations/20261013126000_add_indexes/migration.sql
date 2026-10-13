-- CreateIndex
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "email_logs_status_idx" ON "email_logs"("status");

-- CreateIndex
CREATE INDEX "transactions_account_id_transaction_time_idx" ON "transactions"("account_id", "transaction_time");

-- CreateIndex
CREATE INDEX "transactions_category_id_idx" ON "transactions"("category_id");

-- CreateIndex
CREATE INDEX "local_calendars_start_time_idx" ON "local_calendars"("start_time");

-- CreateIndex
CREATE INDEX "calendar_sync_states_sync_status_idx" ON "calendar_sync_states"("sync_status");
