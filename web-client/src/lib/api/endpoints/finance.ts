import { apiFetch } from "../client";
import type {
  AdjustBalanceInput,
  BankAccount,
  BankAccountDetail,
  BankAccountInput,
  BankAccountUpdate,
  Category,
  CategoryInput,
  CategoryUpdate,
  FinanceSummary,
  FinanceSummaryQuery,
  Id,
  Paginated,
  TotalBalance,
  Transaction,
  TransactionFilter,
  TransactionInput,
  TransactionType,
  TransactionUpdate,
} from "../types";

// accounts
export const listAccounts = (includeInactive?: boolean) =>
  apiFetch<BankAccount[]>("/finance/accounts", { query: { includeInactive } });
export const getTotalBalance = () => apiFetch<TotalBalance>("/finance/accounts/total-balance");
export const getAccount = (id: Id) => apiFetch<BankAccountDetail>(`/finance/accounts/${id}`);
export const createAccount = (input: BankAccountInput) =>
  apiFetch<BankAccount>("/finance/accounts", { method: "POST", json: input });
export const updateAccount = (id: Id, input: BankAccountUpdate) =>
  apiFetch<BankAccount>(`/finance/accounts/${id}`, { method: "PATCH", json: input });
export const adjustBalance = (id: Id, input: AdjustBalanceInput) =>
  apiFetch<BankAccount>(`/finance/accounts/${id}/balance`, { method: "PATCH", json: input });
/** Deletes an account with no transactions; otherwise returns it with isActive false. */
export const deleteAccount = (id: Id) =>
  apiFetch<BankAccount | null>(`/finance/accounts/${id}`, { method: "DELETE" });

// categories
export const listCategories = (type?: TransactionType) =>
  apiFetch<Category[]>("/finance/categories", { query: { type } });
export const createCategory = (input: CategoryInput) =>
  apiFetch<Category>("/finance/categories", { method: "POST", json: input });
export const updateCategory = (id: Id, input: CategoryUpdate) =>
  apiFetch<Category>(`/finance/categories/${id}`, { method: "PATCH", json: input });
export const deleteCategory = (id: Id) => apiFetch<null>(`/finance/categories/${id}`, { method: "DELETE" });

// transactions
export const searchTransactions = (filter: TransactionFilter = {}) =>
  apiFetch<Paginated<Transaction>>("/finance/transactions/search", { method: "POST", json: filter });
export const getTransaction = (id: Id) => apiFetch<Transaction>(`/finance/transactions/${id}`);
export const createTransaction = (input: TransactionInput) =>
  apiFetch<Transaction>("/finance/transactions", { method: "POST", json: input });
export const updateTransaction = (id: Id, input: TransactionUpdate) =>
  apiFetch<Transaction>(`/finance/transactions/${id}`, { method: "PATCH", json: input });
export const deleteTransaction = (id: Id) =>
  apiFetch<null>(`/finance/transactions/${id}`, { method: "DELETE" });

export const getSummary = (query?: FinanceSummaryQuery) =>
  apiFetch<FinanceSummary>("/finance/summary", { query });
