# Finance Service

- **General Description**: Service responsible for managing bank accounts, income/expense categories, processing income/expense transactions with atomic balance updates/reversals, maintaining transactional integrity, generating financial summaries, and integrating AI Tools for financial querying.
- **Accessed Database Tables**:
  - `bank_accounts`
  - `transactions`
  - `categories`

---

## List of Methods

### 1. getAccounts

- **Task Description**: Fetches all active bank accounts and e-wallets, computes the top-level **Total Account** aggregate balance (`SUM(cached_balance)` across active accounts), and returns account details for drill-down inspection.
- **Accessed Tables**: `bank_accounts` (Read)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**: None

- **Output**:
  - `Promise<AccountListResponseDto>`: List of accounts with individual cached balances and total aggregate balance (**Total Account**).

---

### 2. createAccount

- **Task Description**: Creates a new bank account or e-wallet record in `bank_accounts` with an initial cached balance.
- **Accessed Tables**: `bank_accounts` (Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `dto`: `CreateAccountDto` - Data containing accountName, bankCode, accountNumber, initialBalance, and currency.

- **Output**:
  - `Promise<AccountResponseDto>`: Newly created account entity representation.

---

### 3. updateAccount

- **Task Description**: Updates bank account metadata (account name, bank code, currency type) in `bank_accounts`.
- **Accessed Tables**: `bank_accounts` (Read, Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `id` (`string`): Account UUID.
  - `dto`: `UpdateAccountDto` - Metadata updates for the target bank account.

- **Output**:
  - `Promise<AccountResponseDto>`: Updated account entity representation.

---

### 4. adjustBalance

- **Task Description**: Manually updates the cached balance of a bank account to a specified absolute value.
- **Accessed Tables**: `bank_accounts` (Read, Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `id` (`string`): Account UUID.
  - `dto`: `AdjustBalanceDto` - Direct balance adjustment parameters containing `newBalance`.

- **Output**:
  - `Promise<AccountResponseDto>`: Bank account entity with the newly adjusted cached balance.

---

### 5. getTransactions

- **Task Description**: Retrieves a paginated list of transactions filtered by account, category, or date range.
- **Accessed Tables**: `transactions`, `bank_accounts`, `categories` (Read)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `query`: `GetTransactionsQueryDto` - Query parameters including page, limit, accountId, categoryId, startDate, and endDate.

- **Output**:
  - `Promise<PaginatedTransactionsResponseDto>`: Paginated transaction entities with metadata total count.

---

### 6. createTransaction

- **Task Description**: Inserts a new transaction record into `transactions` and atomically updates `bank_accounts.cached_balance` within an ACID database transaction:
  - If `type === 'INCOME'`: Increment account `cached_balance` by `amount`.
  - If `type === 'EXPENSE'`: Decrement account `cached_balance` by `amount`.
  - Guarantees immediate cache consistency and prevents race conditions without requiring runtime ledger aggregations.
- **Accessed Tables**: `transactions` (Write), `bank_accounts` (Read, Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `dto`: `CreateTransactionDto` - Data including accountId, categoryId, amount, type, counterparty, note, transactionTime, and emailLogReferenceId.

- **Output**:
  - `Promise<TransactionResponseDto>`: Created transaction entity.

---

### 7. updateTransaction

- **Task Description**: Modifies an existing transaction record in `transactions` and atomically updates `bank_accounts.cached_balance` within an ACID database transaction:
  - Calculates the net delta between the old and new transaction amounts/types.
  - If account changed: Reverts the previous amount on the old account and applies the new amount on the new account.
  - If account unchanged: Applies the net delta directly to `cached_balance`.
- **Accessed Tables**: `transactions` (Read, Write), `bank_accounts` (Read, Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `id` (`string`): Transaction UUID.
  - `dto`: `UpdateTransactionDto` - Updated fields for amount, type, note, category, counterparty, or transaction time.

- **Output**:
  - `Promise<TransactionResponseDto>`: Updated transaction entity.

---

### 8. deleteTransaction

- **Task Description**: Removes a transaction from `transactions` and performs an atomic balance reversal on `bank_accounts.cached_balance` within an ACID database transaction:
  - If deleted transaction `type === 'INCOME'`: Decrements `cached_balance` by `amount`.
  - If deleted transaction `type === 'EXPENSE'`: Increments `cached_balance` by `amount`.
- **Accessed Tables**: `transactions` (Read, Delete), `bank_accounts` (Read, Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `id` (`string`): Transaction UUID to delete.

- **Output**:
  - `Promise<DeleteTransactionResponseDto>`: Deletion success confirmation status.

---

### 9. getFinanceSummary

- **Task Description**: Calculates total income, total expenses, net cash flow changes, category breakdowns, and time-series chart data for specified time periods (day, week, month, year). Exposed as an AI Tool for assistant queries.
- **Accessed Tables**: `transactions`, `bank_accounts`, `categories` (Read)
- **AI Tool Integration**:
  - **Tool Name**: `get_finance_summary`
  - **Tool Description**: `Retrieves an overall financial fluctuation report (income, expenses, balance) by time period.`
  - **Parameters Schema**:
    - `period` (`string`, required, enum: `['day', 'week', 'month', 'year']`): Reporting period to retrieve.
    - `month` (`number`, optional): Month to query (1-12).
    - `year` (`number`, optional): Year to query.

#### Input / Output

- **Input**:
  - `query`: `FinanceSummaryQueryDto` - Aggregation filter options for period, month, and year.

- **Output**:
  - `Promise<FinanceSummaryResponseDto>`: Overview summary report containing totals, category breakdowns, and chart data points.

---

### 10. getCategories

- **Task Description**: Queries all income and expense categories from `categories` table with optional filtering by category type (`INCOME`/`EXPENSE`).
- **Accessed Tables**: `categories` (Read)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `query` (`GetCategoriesQueryDto`, optional): Filter options by category type.

- **Output**:
  - `Promise<CategoryResponseDto[]>`: Array of category entity representations.

---

### 11. createCategory

- **Task Description**: Validates inputs and inserts a new financial category into `categories` table.
- **Accessed Tables**: `categories` (Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `dto` (`CreateCategoryDto`): Data transfer object containing category `name`, `type` (`INCOME`/`EXPENSE`), optional `icon`, and optional `budgetLimit`.

- **Output**:
  - `Promise<CategoryResponseDto>`: Newly created category entity.

---

### 12. updateCategory

- **Task Description**: Verifies category existence by ID, updates category fields (`name`, `type`, `icon`, `budgetLimit`), and persists modifications to `categories` table.
- **Accessed Tables**: `categories` (Read, Write)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `id` (`string`): Target category UUID.
  - `dto` (`UpdateCategoryDto`): DTO containing updated category attributes.

- **Output**:
  - `Promise<CategoryResponseDto>`: Updated category entity.

---

### 13. deleteCategory

- **Task Description**: Verifies category existence, checks that no active transactions reference this category (or disassociates records to preserve integrity), and deletes the record from `categories`.
- **Accessed Tables**: `categories` (Read, Delete), `transactions` (Read)
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `id` (`string`): Target category UUID to delete.

- **Output**:
  - `Promise<DeleteCategoryResponseDto>`: Deletion success confirmation status.

