# Finance Controller

- **Class**: `FinanceController` — `server/src/finance/finance.controller.ts`
- **Base endpoint**: `/api/v1/finance`
- **Auth**: every route needs the application JWT (global `JwtAuthGuard`).
- **Response**: `{ statusCode, message, data }`.
- **Description**: bank accounts with a cached balance, income / expense categories, transactions, and a summary of
  income and expense per currency. A transaction create, update or delete moves the account balance in the same database
  transaction.

---

## Bank accounts

### 1. Create — `POST /api/v1/finance/accounts`

- **Handler**: `createBankAccount(dto)`. Returns 201.
- **Request** `CreateBankAccountDto`: `accountName`, `bankCode`, `accountNumber` (required strings),
  `cachedBalance?` (number, min 0, default 0, the opening balance), `currency?` (default `VND`), `isActive?` (default true).

### 2. List — `GET /api/v1/finance/accounts?includeInactive=`

- **Handler**: `getAllBankAccounts(includeInactive)`. Active accounts, newest first; all when `includeInactive=true`.

### 3. Total balance — `GET /api/v1/finance/accounts/total-balance`

- **Handler**: `getTotalBalance()`. **Response `data`**: `{ totals: [{ currency, totalBalance, totalAccounts }] }`, one entry
  per currency, active accounts only.

### 4. Get one — `GET /api/v1/finance/accounts/:id`

- **Handler**: `getBankAccountById(id)`. The account with its 10 latest transactions. 404 when missing.

### 5. Update — `PATCH /api/v1/finance/accounts/:id`

- **Handler**: `updateBankAccount(id, dto)`. **Request** `UpdateBankAccountDto`: the create fields except `cachedBalance`,
  all optional. The balance cannot be changed here.

### 6. Set the balance — `PATCH /api/v1/finance/accounts/:id/balance`

- **Handler**: `adjustBalance(id, dto)`. **Request** `AdjustBalanceDto`: `newBalance` (number, at most 2 decimals, required),
  `note?`.
- Records the difference as a transaction (`INCOME` or `EXPENSE`, note default `Manual balance adjustment`). No
  difference → returns the account unchanged.

### 7. Delete — `DELETE /api/v1/finance/accounts/:id`

- **Handler**: `deleteBankAccount(id)`. No transactions → deleted. Otherwise `isActive` is set to false and the row is
  kept. Either way `data` is `null`; the message is "Xóa hoặc vô hiệu hóa tài khoản thành công".

## Categories

### 8. Create — `POST /api/v1/finance/categories`

- **Request** `CreateCategoryDto`: `name`, `type` (`INCOME` | `EXPENSE`) required; `icon?`, `budgetLimit?` (min 0). Returns 201.

### 9. List — `GET /api/v1/finance/categories?type=`

- Optional `type` filter, ordered by name.

### 10. Update — `PATCH /api/v1/finance/categories/:id`

- **Handler**: `updateCategory(id, dto)`. Returns 200. 404 when missing.
- **Request** `UpdateCategoryDto`: `name?`, `icon?`, `budgetLimit?`. `type` cannot be changed (it would break the
  rule that a transaction and its category have the same type). `name: null` counts as not provided; `icon: null` and
  `budgetLimit: null` clear the value.

### 11. Delete — `DELETE /api/v1/finance/categories/:id`

- 404 when missing. Transactions of the category keep existing with `category_id` set to null. `data` is `null`.

## Transactions

### 12. Create — `POST /api/v1/finance/transactions`

- **Handler**: `createTransaction(dto)`. Returns 201, with `account` and `category`.
- **Request** `CreateTransactionDto`: `accountId` (UUID), `amount` (min 0.01), `type`, `transactionTime` (date), all required;
  `categoryId?`, `counterparty?`, `note?`, `emailLogId?`.
- 404 for an unknown account, category or email log; 400 for an inactive account or a category of the other type. A second
  transaction with the same `emailLogId` fails on the unique column.

### 13. Search — `POST /api/v1/finance/transactions/search`

- **Handler**: `getAllTransactions(filter)`. **Body** `FilterTransactionDto`: `accountId?`, `categoryId?`, `type?`, `startDate?`,
  `endDate?`, `page?` (default 1), `pageSize?` (1–100, default 20). Newest `transactionTime` first.
- **Response `data`**: `{ items, total, page, pageSize }`.

### 14. Summary — `GET /api/v1/finance/summary`

- **Handler**: `getSummary(query)`. Returns 200. Declared before the `:id` routes.
- **Query** `SummaryQueryDto`: `startDate?`, `endDate?` (both inclusive, compared in UTC on `transaction_time`),
  `accountId?` (UUID).
- **Response `data`**: `{ totals: [{ currency, income, expense, net }] }`, one entry per currency that has
  transactions in the range; `net = income − expense`. A transaction's currency is its account's currency.

### 15. Get one — `GET /api/v1/finance/transactions/:id`

- With `account`, `category`, `emailLog`. 404 when missing.

### 16. Update — `PATCH /api/v1/finance/transactions/:id`

- **Handler**: `updateTransaction(id, dto)`. Returns 200, with `account` and `category`.
- **Request** `UpdateTransactionDto`: the create fields except `emailLogId`, all optional. `null` counts as not
  provided, except `categoryId: null`, which removes the category.
- 404 for an unknown transaction, account or category. 400 for an account that is inactive and different from the
  current one, or a category of the other type (checked against the final type). The balances are corrected in the same
  database transaction, also when the amount, the type or the account changes.

### 17. Delete — `DELETE /api/v1/finance/transactions/:id`

- Deletes the row and reverses its effect on the balance. `data` is `null`.
