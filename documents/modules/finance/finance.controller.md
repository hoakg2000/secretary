# Finance Controller

- **Class**: `FinanceController` — `server/src/finance/finance.controller.ts`
- **Base endpoint**: `/api/v1/finance`
- **Auth**: every route needs the application JWT (global `JwtAuthGuard`).
- **Response**: `{ statusCode, message, data }`.
- **Description**: bank accounts with a cached balance, income / expense categories, and transactions. A
  transaction moves the account balance in the same database transaction.

Status tags: `[Implemented]` = in the code today. `[Planned]` = designed, not built.

## Change log

| Date | Change |
|------|--------|
| 2026-10-16 | Rewritten from the code. The total balance is `GET /finance/accounts/total-balance` returning `{ totals: [{ currency, totalBalance, totalAccounts }] }` (was `totalAggregateBalance` on `GET /finance/accounts`). Updates are `PATCH`. Transaction listing is `POST /finance/transactions/search`. Added `PATCH /finance/accounts/:id/balance`. Update of transactions / categories and `GET /finance/summary` are `[Planned]`. |
| 2026-10-16 | Review fix: an unknown `categoryId` on transaction create answers 404. |

---

## Bank accounts

### 1. Create — `POST /api/v1/finance/accounts` `[Implemented]`

- **Handler**: `createBankAccount(dto)`. Returns 201.
- **Request** `CreateBankAccountDto`: `accountName`, `bankCode`, `accountNumber` (required strings),
  `cachedBalance?` (number, min 0, default 0, the opening balance), `currency?` (default `VND`), `isActive?` (default true).

### 2. List — `GET /api/v1/finance/accounts?includeInactive=` `[Implemented]`

- **Handler**: `getAllBankAccounts(includeInactive)`. Active accounts, newest first; all when `includeInactive=true`.

### 3. Total balance — `GET /api/v1/finance/accounts/total-balance` `[Implemented]`

- **Handler**: `getTotalBalance()`. **Response `data`**: `{ totals: [{ currency, totalBalance, totalAccounts }] }`, one entry
  per currency, active accounts only.

### 4. Get one — `GET /api/v1/finance/accounts/:id` `[Implemented]`

- **Handler**: `getBankAccountById(id)`. The account with its 10 latest transactions. 404 when missing.

### 5. Update — `PATCH /api/v1/finance/accounts/:id` `[Implemented]`

- **Handler**: `updateBankAccount(id, dto)`. **Request** `UpdateBankAccountDto`: the create fields except `cachedBalance`,
  all optional. The balance cannot be changed here.

### 6. Set the balance — `PATCH /api/v1/finance/accounts/:id/balance` `[Implemented]`

- **Handler**: `adjustBalance(id, dto)`. **Request** `AdjustBalanceDto`: `newBalance` (number, at most 2 decimals, required),
  `note?`.
- Records the difference as a transaction (`INCOME` or `EXPENSE`, note default `Manual balance adjustment`). No
  difference → returns the account unchanged.

### 7. Delete — `DELETE /api/v1/finance/accounts/:id` `[Implemented]`

- **Handler**: `deleteBankAccount(id)`. No transactions → deleted, `{ success: true }`. Otherwise `isActive` is set to false and the
  account is returned.

## Categories

### 8. Create — `POST /api/v1/finance/categories` `[Implemented]`

- **Request** `CreateCategoryDto`: `name`, `type` (`INCOME` | `EXPENSE`) required; `icon?`, `budgetLimit?` (min 0). Returns 201.

### 9. List — `GET /api/v1/finance/categories?type=` `[Implemented]`

- Optional `type` filter, ordered by name.

### 10. Delete — `DELETE /api/v1/finance/categories/:id` `[Implemented]`

- 404 when missing. Transactions of the category keep existing with `category_id` set to null.

## Transactions

### 11. Create — `POST /api/v1/finance/transactions` `[Implemented]`

- **Handler**: `createTransaction(dto)`. Returns 201, with `account` and `category`.
- **Request** `CreateTransactionDto`: `accountId` (UUID), `amount` (min 0.01), `type`, `transactionTime` (date), all required;
  `categoryId?`, `counterparty?`, `note?`, `emailLogId?`.
- 404 for an unknown account, category or email log; 400 for an inactive account or a category of the other type. A second
  transaction with the same `emailLogId` fails on the unique column.

### 12. Search — `POST /api/v1/finance/transactions/search` `[Implemented]`

- **Handler**: `getAllTransactions(filter)`. **Body** `FilterTransactionDto`: `accountId?`, `categoryId?`, `type?`, `startDate?`,
  `endDate?`, `page?` (default 1), `pageSize?` (1–100, default 20). Newest `transactionTime` first.
- **Response `data`**: `{ items, total, page, pageSize }`.

### 13. Get one — `GET /api/v1/finance/transactions/:id` `[Implemented]`

- With `account`, `category`, `emailLog`. 404 when missing.

### 14. Delete — `DELETE /api/v1/finance/transactions/:id` `[Implemented]`

- Deletes the row and reverses its effect on the balance. `data`: `{ success: true }`.

## Not built `[Planned]`

- Update of a transaction and of a category.
- `GET /finance/summary`. The AI tool `get_financial_summary` returns the totals and active accounts today.
