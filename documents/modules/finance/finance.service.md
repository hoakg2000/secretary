# Finance Service

- **Class**: `FinanceService` — `server/src/finance/finance.service.ts`
- **Description**: bank accounts, categories and transactions, and three AI tools. The cached balance of an account is
  changed only by `increment` / `decrement` inside the database transaction that writes a ledger row.
- **Tables**: `bank_accounts`, `transactions`, `categories` (read, write); `email_logs` (read).
- **Callers**: `FinanceController`, `AgentService` (AI tools), `EmailProcessor` (`createTransaction`).

---

## Methods

### 1. createBankAccount / getAllBankAccounts / getBankAccountById / updateBankAccount

- `createBankAccount`: defaults `cachedBalance` 0, `currency` `VND`, `isActive` true.
- `getAllBankAccounts(includeInactive = false)`: newest first.
- `getBankAccountById(id)`: with the 10 latest transactions; `NotFoundException` when missing.
- `updateBankAccount(id, dto)`: no balance field.

### 2. deleteBankAccount(id)

- No transactions → delete, return `{ success: true }`. With transactions → `is_active = false` (the foreign key from
  `transactions` is `restrict`) and return the account.

### 3. adjustBalance(id, dto)

- In one transaction: reads the balance, inserts a ledger row for the difference to `newBalance`, and increments the
  balance by it. Zero difference → no row.
- Known limit: the read and the write run at the default isolation level, so a concurrent transaction can leave the
  final balance different from `newBalance`. Upgrade to `SELECT … FOR UPDATE` when there are concurrent writers.

### 4. getTotalBalance()

- `groupBy` currency over active accounts: `{ totals: [{ currency, totalBalance, totalAccounts }] }`.

### 5. createCategory / getAllCategories / getCategoryById / updateCategory / deleteCategory

- `getAllCategories(type?)` ordered by name. `deleteCategory` returns `{ success: true }`.
- `updateCategory(id, dto)`: 404 through `getCategoryById`; `type` is not in the DTO. `name: null` is treated as not
  provided; `icon: null` and `budgetLimit: null` clear the column.

### 6. createTransaction(dto)

- Checks: account exists (404) and is active (400); `categoryId`, when given, exists (404) and has the same type as the
  transaction (400); `emailLogId`, when given, exists (404).
- One database transaction: `cachedBalance` incremented (`INCOME`) or decremented (`EXPENSE`) by `amount`, then the
  transaction row is created.
- `transactions.email_log_id` is unique, so a worker retry cannot create a second transaction for one email.

### 7. getAllTransactions(filter)

- Filters by account, category, type, `startDate`..`endDate` on `transaction_time`; newest first; returns
  `{ items, total, page, pageSize }`.

### 8. getTransactionById / deleteTransaction

- `deleteTransaction`: in one database transaction deletes the row and reverses its balance effect.

### 9. updateTransaction(id, dto)

- Everything runs inside one database transaction. The stored row is read first (404). `null` fields count as not
  provided, except `categoryId: null`, which removes the category. `emailLogId` cannot be edited.
- Validation before any write: the target account exists (404); it must be active (400) only when the account changes,
  so a transaction on a closed account can still be edited; the category, when set, exists (404) and has the final type
  (400).
- Writes: reverse the old movement on the old account, apply the new movement (final amount and type) on the final
  account, update the row. Amounts use `Prisma.Decimal`.
- Known limit: read and write run at the default isolation level, so two concurrent edits of one transaction can both
  reverse the old amount. Upgrade to `SELECT … FOR UPDATE` on the transaction row when there are concurrent writers.

### 10. getSummary(dto)

- Filters by `accountId` and by `transaction_time` between `startDate` and `endDate` (inclusive, UTC). Groups
  `transactions` by account and type (`_sum.amount`), maps accounts to their currency, and adds income and expense per
  currency in `Prisma.Decimal`. Returns `{ totals: [{ currency, income, expense, net }] }`. Not an AI tool.

---

## AI tools

| Tool | Method | Confirmation | Parameters |
|------|--------|--------------|------------|
| `get_financial_summary` | `aiGetFinancialSummary()` | no | none. Returns `getTotalBalance()` and the active accounts. |
| `create_financial_transaction` | `aiCreateTransaction(dto)` | **yes** | `AiCreateTransactionDto`: `accountId`, `amount`, `type` (`INCOME` / `EXPENSE`), `categoryId?`, `counterparty?`, `note?`, `transactionTime?` (default now). `emailLogId` is not available to the model. |
| `search_financial_transactions` | `aiSearchTransactions(dto)` | no | `FilterTransactionDto`: `accountId?`, `categoryId?`, `type?`, `startDate?`, `endDate?`, `page?` (default 1), `pageSize?` (default 20, max 100); all are declared to the model. |

`create_financial_transaction` is parked in `PendingActionStore` and runs only after
`POST /ai-agent/actions/:actionId/confirm`.
