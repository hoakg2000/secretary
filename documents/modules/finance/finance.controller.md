# Finance Controller

- **Base Endpoint**: `/api/v1/finance`
- **General Description**: Controller handling financial management operations including bank accounts and e-wallets listing, creation, modification, balance adjustment, income/expense categories management, income/expense transactions management, and financial summary report retrieval.

---

## List of Endpoints

### 1. Get Accounts List

- **Endpoint**: `GET /api/v1/finance/accounts`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Retrieves the top-level **Total Account** aggregate balance across all active accounts and the list of individual bank accounts/e-wallets with their real-time `cachedBalance` for drill-down inspection ("See More").

#### Data Transfer Objects (DTO)

- **Request DTO**: None

- **Response DTO**: `AccountListResponseDto`
  - `totalAggregateBalance` (`number`): The aggregate cached balance summed across all active bank accounts and e-wallets (**Total Account**).
  - `accounts` (`AccountResponseDto[]`): Array of individual bank accounts and e-wallets for drill-down:
    - `id` (`string`): Account UUID.
    - `accountName` (`string`): Name of the account or wallet.
    - `bankCode` (`string`): Code representing the bank or provider.
    - `accountNumber` (`string`): Bank account or wallet identifier.
    - `cachedBalance` (`number`): Real-time cached balance of this account.
    - `currency` (`string`): Currency unit (e.g., USD, VND).
    - `isActive` (`boolean`): Active status of the account.

---

### 2. Create Bank Account / E-Wallet

- **Endpoint**: `POST /api/v1/finance/accounts`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Adds a new bank account or e-wallet to the finance tracking system.

#### Data Transfer Objects (DTO)

- **Request DTO**: `CreateAccountDto`
  - `accountName` (`string`, required): Display name for the bank account or e-wallet.
  - `bankCode` (`string`, required): Bank identifier code.
  - `accountNumber` (`string`, required): Account or card number.
  - `initialBalance` (`number`, required): Initial starting balance for the account.
  - `currency` (`string`, required): Currency type (e.g., USD, VND).

- **Response DTO**: `AccountResponseDto`
  - `id` (`string`): Account UUID.
  - `accountName` (`string`): Name of the account.
  - `bankCode` (`string`): Bank identifier code.
  - `accountNumber` (`string`): Account number.
  - `cachedBalance` (`number`): Current cached balance.
  - `currency` (`string`): Currency code.
  - `isActive` (`boolean`): Status of the account.

---

### 3. Update Bank Account Information

- **Endpoint**: `PUT /api/v1/finance/accounts/:id`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Updates basic information of an existing bank account or e-wallet, such as account name, bank code, and currency type.

#### Data Transfer Objects (DTO)

- **Request DTO**: `UpdateAccountDto`
  - `id` (`string`, path param): Account UUID.
  - `accountName` (`string`, optional): Updated account name.
  - `bankCode` (`string`, optional): Updated bank code.
  - `currency` (`string`, optional): Updated currency type.

- **Response DTO**: `AccountResponseDto`
  - `id` (`string`): Account UUID.
  - `accountName` (`string`): Name of the account.
  - `bankCode` (`string`): Bank code.
  - `accountNumber` (`string`): Account number.
  - `cachedBalance` (`number`): Current cached balance.
  - `currency` (`string`): Currency code.
  - `isActive` (`boolean`): Status of the account.

---

### 4. Adjust Account Base Balance

- **Endpoint**: `PATCH /api/v1/finance/accounts/:id/balance`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Directly adjusts the base balance of a specific bank account or e-wallet (Manual Balance Adjustment).

#### Data Transfer Objects (DTO)

- **Request DTO**: `AdjustBalanceDto`
  - `id` (`string`, path param): Account UUID.
  - `newBalance` (`number`, required): New absolute balance value to be updated directly into cached balance.

- **Response DTO**: `AccountResponseDto`
  - `id` (`string`): Account UUID.
  - `accountName` (`string`): Name of the account.
  - `bankCode` (`string`): Bank code.
  - `accountNumber` (`string`): Account number.
  - `cachedBalance` (`number`): Adjusted cached balance.
  - `currency` (`string`): Currency code.
  - `isActive` (`boolean`): Status of the account.

---

### 5. Get Transaction History

- **Endpoint**: `GET /api/v1/finance/transactions`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Retrieves a paginated list of income and expense transaction history, with optional filtering by time range, account type, and category.

#### Data Transfer Objects (DTO)

- **Request DTO**: `GetTransactionsQueryDto`
  - `page` (`number`, optional): Page number for pagination (default: 1).
  - `limit` (`number`, optional): Limit per page (default: 10).
  - `accountId` (`string`, optional): Filter transactions by bank account ID.
  - `categoryId` (`string`, optional): Filter transactions by category ID.
  - `startDate` (`string`, optional): ISO 8601 start timestamp filter.
  - `endDate` (`string`, optional): ISO 8601 end timestamp filter.

- **Response DTO**: `PaginatedTransactionsResponseDto`
  - `data` (`TransactionResponseDto[]`): Array of transaction records.
    - `id` (`string`): Transaction UUID.
    - `accountId` (`string`): Account UUID.
    - `categoryId` (`string`): Category UUID.
    - `amount` (`number`): Transaction amount.
    - `type` (`string`): Transaction type (`INCOME` or `EXPENSE`).
    - `counterparty` (`string`): Transaction counterparty name.
    - `note` (`string`): Transaction note.
    - `transactionTime` (`string`): ISO 8601 timestamp of transaction.
    - `emailLogReferenceId` (`string`): Optional reference ID linking to email log.
  - `total` (`number`): Total records matching criteria.
  - `page` (`number`): Current page index.
  - `limit` (`number`): Current page limit size.

---

### 6. Create Transaction
 
 - **Endpoint**: `POST /api/v1/finance/transactions`
 - **Guard / Auth**: `AuthGuard('jwt')`
 - **Description**: Adds a manual income or expense transaction and atomically updates the associated account's `cached_balance` (`+amount` for `INCOME`, `-amount` for `EXPENSE`) in an ACID database transaction.
 
 #### Data Transfer Objects (DTO)
 
 - **Request DTO**: `CreateTransactionDto`
   - `accountId` (`string`, required): Account UUID.
   - `categoryId` (`string`, required): Category UUID.
   - `amount` (`number`, required): Transaction amount.
   - `type` (`string`, required, enum: `['INCOME', 'EXPENSE']`): Transaction type.
   - `counterparty` (`string`, optional): Transaction recipient/sender.
   - `note` (`string`, optional): Transaction description note.
   - `transactionTime` (`string`, required): ISO 8601 timestamp.
   - `emailLogReferenceId` (`string`, optional): Referenced email log ID.
 
 - **Response DTO**: `TransactionResponseDto`
   - `id` (`string`): Created transaction UUID.
   - `accountId` (`string`): Account UUID.
   - `categoryId` (`string`): Category UUID.
   - `amount` (`number`): Transaction amount.
   - `type` (`string`): Transaction type (`INCOME` or `EXPENSE`).
   - `counterparty` (`string`): Counterparty detail.
   - `note` (`string`): Transaction note.
   - `transactionTime` (`string`): Transaction time.
   - `emailLogReferenceId` (`string`): Linked email log ID if present.
 
 ---
 
 ### 7. Update Transaction Details
 
 - **Endpoint**: `PUT /api/v1/finance/transactions/:id`
 - **Guard / Auth**: `AuthGuard('jwt')`
 - **Description**: Modifies transaction details (amount, note, category, transaction time) and atomically calculates/adjusts the balance delta on the target account's `cached_balance` within an ACID database transaction.
 
 #### Data Transfer Objects (DTO)
 
 - **Request DTO**: `UpdateTransactionDto`
   - `id` (`string`, path param): Transaction UUID.
   - `accountId` (`string`, optional): Target account UUID.
   - `categoryId` (`string`, optional): Category UUID.
   - `amount` (`number`, optional): Updated transaction amount.
   - `type` (`string`, optional, enum: `['INCOME', 'EXPENSE']`): Updated transaction type.
   - `counterparty` (`string`, optional): Updated counterparty name.
   - `note` (`string`, optional): Updated note.
   - `transactionTime` (`string`, optional): Updated ISO 8601 timestamp.
 
 - **Response DTO**: `TransactionResponseDto`
   - `id` (`string`): Updated transaction UUID.
   - `accountId` (`string`): Account UUID.
   - `categoryId` (`string`): Category UUID.
   - `amount` (`number`): Updated amount.
   - `type` (`string`): Updated type.
   - `counterparty` (`string`): Updated counterparty.
   - `note` (`string`): Updated note.
   - `transactionTime` (`string`): Updated timestamp.
   - `emailLogReferenceId` (`string`): Linked email log reference ID.
 
 ---
 
 ### 8. Delete Transaction
 
 - **Endpoint**: `DELETE /api/v1/finance/transactions/:id`
 - **Guard / Auth**: `AuthGuard('jwt')`
 - **Description**: Deletes a transaction and performs an atomic balance reversal (`-amount` for `INCOME`, `+amount` for `EXPENSE`) on the associated bank account's `cached_balance` within an ACID database transaction.
 
 #### Data Transfer Objects (DTO)
 
 - **Request DTO**: `DeleteTransactionParamsDto`
   - `id` (`string`, path param): Transaction UUID to delete.
 
 - **Response DTO**: `DeleteTransactionResponseDto`
   - `success` (`boolean`): Operation success status.
   - `message` (`string`): Status description message.
 
 ---

### 9. Get Financial Summary Report

- **Endpoint**: `GET /api/v1/finance/summary`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Generates an overview report of financial fluctuations including total income, total expenses, net balance changes, and cash flow/category breakdown chart data across Daily, Weekly, Monthly, or Yearly cycles.

#### Data Transfer Objects (DTO)

- **Request DTO**: `FinanceSummaryQueryDto`
  - `period` (`string`, required, enum: `['day', 'week', 'month', 'year']`): Summary aggregation cycle.
  - `month` (`number`, optional): Month integer (1-12) for specific filtering.
  - `year` (`number`, optional): Year integer for filtering.

- **Response DTO**: `FinanceSummaryResponseDto`
  - `totalIncome` (`number`): Total aggregate income for the period.
  - `totalExpenses` (`number`): Total aggregate expenses for the period.
  - `netChange` (`number`): Net change in financial balance (income - expenses).
  - `categoryBreakdown` (`CategoryBreakdownDto[]`): Spending/income breakdown grouped by categories.
    - `categoryId` (`string`): Category UUID.
    - `categoryName` (`string`): Category name.
    - `totalAmount` (`number`): Sum of transactions in this category.
  - `chartData` (`ChartDataPointDto[]`): Time-series metrics for cash flow plotting.
    - `label` (`string`): Time label (e.g., date, week number, or month).
    - `income` (`number`): Income amount in the time slice.
    - `expenses` (`number`): Expenses amount in the time slice.

---

### 10. Get Categories List

- **Endpoint**: `GET /api/v1/finance/categories`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Retrieves all income and expense categories from `categories`, with an optional filter by transaction category type (`INCOME` or `EXPENSE`).

#### Data Transfer Objects (DTO)

- **Request DTO**: `GetCategoriesQueryDto`
  - `type` (`string`, optional, enum: `['INCOME', 'EXPENSE']`): Filter categories by type.

- **Response DTO**: `CategoryResponseDto[]`
  - `id` (`string`): Category UUID.
  - `name` (`string`): Category display name.
  - `type` (`string`, enum: `['INCOME', 'EXPENSE']`): Category type.
  - `icon` (`string`): Icon identifier/URL for UI presentation.
  - `budgetLimit` (`number`, optional): Budget spending limit threshold for this category.
  - `createdAt` (`string`): ISO 8601 timestamp of creation.
  - `updatedAt` (`string`): ISO 8601 timestamp of last update.

---

### 11. Create Financial Category

- **Endpoint**: `POST /api/v1/finance/categories`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Creates a new financial income or expense category in `categories`.

#### Data Transfer Objects (DTO)

- **Request DTO**: `CreateCategoryDto`
  - `name` (`string`, required): Name of category.
  - `type` (`string`, required, enum: `['INCOME', 'EXPENSE']`): Category type.
  - `icon` (`string`, optional): Icon identifier.
  - `budgetLimit` (`number`, optional): Budget spending limit for expense categories.

- **Response DTO**: `CategoryResponseDto`
  - `id` (`string`): Created category UUID.
  - `name` (`string`): Category name.
  - `type` (`string`): Category type.
  - `icon` (`string`): Category icon.
  - `budgetLimit` (`number`): Budget limit value.
  - `createdAt` (`string`): ISO timestamp.
  - `updatedAt` (`string`): ISO timestamp.

---

### 12. Update Financial Category

- **Endpoint**: `PUT /api/v1/finance/categories/:id`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Modifies an existing category's name, type, icon, or budget limit in `categories`.

#### Data Transfer Objects (DTO)

- **Request DTO**: `UpdateCategoryDto`
  - `id` (`string`, path param, required): Category UUID.
  - `name` (`string`, optional): Updated category name.
  - `type` (`string`, optional, enum: `['INCOME', 'EXPENSE']`): Updated category type.
  - `icon` (`string`, optional): Updated icon.
  - `budgetLimit` (`number`, optional): Updated budget limit.

- **Response DTO**: `CategoryResponseDto`
  - `id` (`string`): Updated category UUID.
  - `name` (`string`): Category name.
  - `type` (`string`): Category type.
  - `icon` (`string`): Category icon.
  - `budgetLimit` (`number`): Budget limit.
  - `updatedAt` (`string`): ISO timestamp.

---

### 13. Delete Financial Category

- **Endpoint**: `DELETE /api/v1/finance/categories/:id`
- **Guard / Auth**: `AuthGuard('jwt')`
- **Description**: Deletes an existing category from `categories` by ID. Prevents deletion or dissociates linked transactions to maintain database referential integrity.

#### Data Transfer Objects (DTO)

- **Request DTO**: `DeleteCategoryParamsDto`
  - `id` (`string`, path param, required): Category UUID to delete.

- **Response DTO**: `DeleteCategoryResponseDto`
  - `success` (`boolean`): Operation success status.
  - `id` (`string`): ID of deleted category.

