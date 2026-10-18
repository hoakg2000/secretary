export const FINANCE_KEY = ["finance"] as const;
export const totalBalanceKey = [...FINANCE_KEY, "total-balance"] as const;
export const summaryKey = (year: number, month: number) => [...FINANCE_KEY, "summary", year, month] as const;
export const accountsKey = (includeInactive: boolean) => [...FINANCE_KEY, "accounts", includeInactive] as const;
export const CATEGORIES_KEY = [...FINANCE_KEY, "categories"] as const;
export const TRANSACTIONS_KEY = [...FINANCE_KEY, "transactions"] as const;
