# Finance Service

- **Class**: `FinanceService` — `server/src/finance/finance.service.ts`
- **Description**: bank accounts, categories and transactions, and three AI tools. The cached balance of an account is
  changed only by `increment` / `decrement` inside the database transaction that writes a ledger row.
- **Tables**: `bank_accounts`, `transactions`, `categories` (read, write); `email_logs` (read).
- **Callers**: `FinanceController`, `AgentService` (AI tools), `EmailProcessor` (`createTransaction`).

Status tags: `[Implemented]` = in the code today. `[Planned]` = designed, not built.

## Change log

| Date | Change |
|------|--------|
| 2026-10-16 | Rewritten from the code. The summary AI tool is `get_financial_summary` (was `get_finance_summary`). Added `adjustBalance`, `getTotalBalance`, the account delete-or-deactivate rule, and the category / email-log checks. Update of transactions and categories, and a period summary, are `[Planned]`. |
| 2026-10-16 | Review fix: the category check is 404 when missing, 400 on a type mismatch. |

---

## Methods

### 1. createBankAccount / getAllBankAccounts / getBankAccountById / updateBankAccount `[Implemented]`

- `createBankAccount`: defaults `cachedBalance` 0, `currency` `VND`, `isActive` true.
- `getAllBankAccounts(includeInactive = false)`: newest first.
- `getBankAccountById(id)`: with the 10 latest transactions; `NotFoundException` when missing.
- `updateBankAccount(id, dto)`: no balance field.

### 2. deleteBankAccount(id) `[Implemented]`

- No transactions → delete, return `{ success: true }`. With transactions → `is_active = false` (the foreign key from
  `transactions` is `restrict`) and return the account.

### 3. adjustBalance(id, dto) `[Implemented]`

- In one transaction: reads the balance, inserts a ledger row for the difference to `newBalance`, and increments the
  balance by it. Zero difference → no row.
- Known limit: the read and the write run at the default isolation level, so a concurrent transaction can leave the
  final balance different from `newBalance`. Upgrade to `SELECT … FOR UPDATE` when there are concurrent writers.

### 4. getTotalBalance() `[Implemented]`

- `groupBy` currency over active accounts: `{ totals: [{ currency, totalBalance, totalAccounts }] }`.

### 5. createCategory / getAllCategories / getCategoryById / deleteCategory `[Implemented]`

- `getAllCategories(type?)` ordered by name. `deleteCategory` returns `{ success: true }`.

### 6. createTransaction(dto) `[Implemented]`

- Checks: account exists (404) and is active (400); `categoryId`, when given, exists (404) and has the same type as the
  transaction (400); `emailLogId`, when given, exists (404).
- One database transaction: `cachedBalance` incremented (`INCOME`) or decremented (`EXPENSE`) by `amount`, then the
  transaction row is created.
- `transactions.email_log_id` is unique, so a worker retry cannot create a second transaction for one email.

### 7. getAllTransactions(filter) `[Implemented]`

- Filters by account, category, type, `startDate`..`endDate` on `transaction_time`; newest first; returns
  `{ items, total, page, pageSize }`.

### 8. getTransactionById / deleteTransaction `[Implemented]`

- `deleteTransaction`: in one database transaction deletes the row and reverses its balance effect.

---

## AI tools

| Tool | Method | Confirmation | Parameters |
|------|--------|--------------|------------|
| `get_financial_summary` | `aiGetFinancialSummary()` | no | none. Returns `getTotalBalance()` and the active accounts. |
| `create_financial_transaction` | `aiCreateTransaction(dto)` | **yes** | `AiCreateTransactionDto`: `accountId`, `amount`, `type` (`INCOME` / `EXPENSE`), `categoryId?`, `counterparty?`, `note?`, `transactionTime?` (default now). `emailLogId` is not available to the model. |
| `search_financial_transactions` | `aiSearchTransactions(dto)` | no | `FilterTransactionDto`: `accountId?`, `type?`, `startDate?`, `endDate?` (the model is not told about `categoryId`, `page`, `pageSize`). |

`create_financial_transaction` is parked in `PendingActionStore` and runs only after
`POST /ai-agent/actions/:actionId/confirm`.
