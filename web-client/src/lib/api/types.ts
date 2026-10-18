// Hand-written from server controllers/DTOs/Prisma schema. Dates are ISO strings; Prisma Decimal arrives as a string.

export type Id = string;
export type IsoDate = string;
export type DecimalString = string;

/** Success envelope. Some routes return `data: null`. */
export interface ApiEnvelope<T> {
  statusCode: number;
  message: string;
  data: T;
}

/** Nest error body: `message` is a string or a list of validation messages. */
export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PageQuery {
  page?: number;
  pageSize?: number;
}

// ---------- auth ----------

export interface AuthUser {
  id: Id;
  email: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  user: AuthUser;
}

export interface RefreshResult {
  accessToken: string;
}

export interface SessionInfo {
  sessionId: Id;
  ipAddress: string | null;
  userAgent: string | null;
  lastActiveAt: IsoDate;
  createdAt: IsoDate;
  user: AuthUser & { isActive: boolean; createdAt: IsoDate };
}

export interface GoogleConnectResult {
  url: string;
}

export interface GoogleStatus {
  connected: boolean;
}

// ---------- characters ----------

export interface Character {
  id: Id;
  name: string;
  voiceId: string | null;
  source: string | null;
  memoryRule: string | null;
  slug: string | null;
  systemPrompt: string | null;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface CharacterInput {
  name: string;
  voiceId?: string;
  source?: string;
  /** max 2000 */
  memoryRule?: string;
  /** max 20000 */
  systemPrompt?: string;
}

// ---------- chat ----------

export interface SessionCharacter {
  id: Id;
  name: string;
  voiceId: string | null;
}

export interface ChatSession {
  id: Id;
  userId: Id;
  characterId: Id | null;
  title: string | null;
  lastMessageAt: IsoDate;
  createdAt: IsoDate;
  updatedAt: IsoDate;
  character: SessionCharacter | null;
}

export interface CreateSessionInput {
  characterId: Id;
  /** max 120 */
  title?: string;
}

export type ChatRole = "USER" | "MODEL";

export interface ChatMessage {
  id: Id;
  sessionId: Id;
  role: ChatRole;
  content: string;
  contentJp: string | null;
  toolCalls: unknown;
  memoryId: Id | null;
  createdAt: IsoDate;
}

export interface ChatStreamInput {
  message: string;
  sessionId?: Id;
  /** required when there is no sessionId */
  characterId?: Id;
}

export type ChatFrame =
  | { type: "session"; sessionId: Id }
  | { type: "text"; content: string }
  | { type: "tool_call"; tool: string; args: unknown }
  | { type: "tool_result"; tool: string; result: unknown }
  | { type: "confirmation_required"; actionId: string; tool: string; args: unknown }
  | { type: "error"; message: string }
  | { type: "reply"; messageId: Id; contentJp: string | null }
  | { type: "done" };

export interface ConfirmActionResult {
  tool: string;
  result: unknown;
}

// ---------- memories ----------

export interface Memory {
  id: Id;
  content: string;
  category: string | null;
  source: string | null;
  initialScore: number;
  decayFactor: number;
  lastAccessedAt: IsoDate;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface SaveMemoryInput {
  content: string;
  category?: string;
  source?: string;
  initialScore?: number;
  decayFactor?: number;
}

export interface UpdateMemoryInput {
  content?: string;
  /** null clears the category */
  category?: string | null;
}

export interface ListMemoryQuery extends PageQuery {
  category?: string;
  source?: string;
}

export interface SearchMemoryInput {
  query: string;
  category?: string;
  source?: string;
  /** 1-20 */
  limit?: number;
  /** 0-1, server default 0.5 */
  minScore?: number;
}

export interface MemorySearchResult {
  id: Id;
  content: string;
  category: string | null;
  source: string | null;
  similarity: number;
  decayedScore: number;
  finalScore: number;
  createdAt: IsoDate;
  lastAccessedAt: IsoDate;
}

// ---------- email ----------

export type EmailStatus = "PENDING" | "PROCESSED" | "SKIPPED" | "FAILED";

/** List row: the server leaves `rawBody` out. */
export interface EmailLogSummary {
  id: Id;
  messageId: string;
  sender: string;
  subject: string | null;
  aiSummary: string | null;
  status: EmailStatus;
  createdAt: IsoDate;
}

export interface EmailLog extends EmailLogSummary {
  rawBody: string | null;
}

export interface ListEmailLogQuery extends PageQuery {
  status?: EmailStatus;
}

export interface EmailIngestInput {
  messageId: string;
  sender: string;
  subject?: string;
  rawBody?: string;
}

export type EmailRuleType = "blacklist" | "moneylist" | "whitelist";
export type EmailMatcher = "sender" | "keyword" | "regex";

export interface EmailRule {
  id: Id;
  type: EmailRuleType;
  matcher: EmailMatcher;
  matchValue: string;
  description: string | null;
  isActive: boolean;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface EmailRuleInput {
  type: EmailRuleType;
  matcher: EmailMatcher;
  matchValue: string;
  description?: string;
  isActive?: boolean;
}

// ---------- finance ----------

export type TransactionType = "INCOME" | "EXPENSE";

export interface BankAccount {
  id: Id;
  accountName: string;
  bankCode: string;
  accountNumber: string;
  cachedBalance: DecimalString;
  currency: string;
  isActive: boolean;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface BankAccountDetail extends BankAccount {
  transactions: Transaction[];
}

export interface BankAccountInput {
  accountName: string;
  bankCode: string;
  accountNumber: string;
  /** opening balance */
  cachedBalance?: number;
  currency?: string;
  isActive?: boolean;
}

/** PATCH accounts/:id never changes the balance. */
export type BankAccountUpdate = Partial<Omit<BankAccountInput, "cachedBalance">>;

export interface AdjustBalanceInput {
  newBalance: number;
  note?: string;
}

export interface TotalBalance {
  totals: { currency: string; totalBalance: DecimalString; totalAccounts: number }[];
}

export interface Category {
  id: Id;
  name: string;
  type: TransactionType;
  icon: string | null;
  budgetLimit: DecimalString | null;
  createdAt: IsoDate;
}

export interface CategoryInput {
  name: string;
  type: TransactionType;
  icon?: string;
  budgetLimit?: number;
}

/** `type` cannot change; `null` clears icon / budgetLimit. */
export type CategoryUpdate = { name?: string; icon?: string | null; budgetLimit?: number | null };

export interface Transaction {
  id: Id;
  accountId: Id;
  categoryId: Id | null;
  amount: DecimalString;
  type: TransactionType;
  counterparty: string | null;
  note: string | null;
  transactionTime: IsoDate;
  emailLogId: Id | null;
  createdAt: IsoDate;
}

export interface TransactionInput {
  accountId: Id;
  categoryId?: Id;
  /** >= 0.01 */
  amount: number;
  type: TransactionType;
  counterparty?: string;
  note?: string;
  transactionTime: IsoDate;
  emailLogId?: Id;
}

/** `emailLogId` cannot change; `null` clears the category, counterparty or note. */
export type TransactionUpdate = Partial<Omit<TransactionInput, "emailLogId" | "categoryId" | "counterparty" | "note">> & {
  categoryId?: Id | null;
  counterparty?: string | null;
  note?: string | null;
};

export interface TransactionFilter extends PageQuery {
  accountId?: Id;
  categoryId?: Id;
  type?: TransactionType;
  startDate?: string;
  endDate?: string;
}

export interface FinanceSummaryQuery {
  startDate?: string;
  endDate?: string;
  accountId?: Id;
}

export interface FinanceSummary {
  totals: { currency: string; income: DecimalString; expense: DecimalString; net: DecimalString }[];
}

// ---------- calendar ----------

export type SyncStatus = "SYNCED" | "DIRTY" | "CONFLICT";

export interface CalendarSyncState {
  id: Id;
  localEventId: Id;
  googleEventId: string | null;
  syncStatus: SyncStatus;
  lastSyncedAt: IsoDate | null;
  eTag: string | null;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface CalendarEvent {
  id: Id;
  title: string;
  description: string | null;
  location: string | null;
  startTime: IsoDate;
  endTime: IsoDate;
  attendees: unknown[] | null;
  intent: string | null;
  priorityStatus: string | null;
  deletedAt: IsoDate | null;
  remindedAt: IsoDate | null;
  createdAt: IsoDate;
  updatedAt: IsoDate;
  syncState: CalendarSyncState | null;
}

export interface CalendarEventInput {
  title: string;
  description?: string;
  location?: string;
  startTime: IsoDate;
  /** must be after startTime */
  endTime: IsoDate;
  attendees?: unknown[];
  intent?: string;
  priorityStatus?: string;
}

export interface CalendarQuery {
  /** 1-12 */
  month?: number;
  /** 2000-2100 */
  year?: number;
}

/** `null` when Google is not connected or a sync run is in progress. */
export type CalendarSyncResult = {
  pushed: number;
  deleted: number;
  removedRemotely: number;
  failed: number;
} | null;

// ---------- proactive ----------

export type ProactiveTriggerType =
  | "URGENT_EVENT"
  | "INACTIVITY_FALLBACK"
  | "SCHEDULED_REMINDER"
  | "CUSTOM";

export interface ProactiveTriggerInput {
  type: ProactiveTriggerType;
  message: string;
  channel?: "TELEGRAM";
  metadata?: Record<string, unknown>;
}

export interface ProactiveTriggerResult {
  success: boolean;
  channel: string;
  payload: unknown;
  result: { status: "SENT" | "FAILED" | "NOT_CONFIGURED"; at: IsoDate };
}

export interface SuccessResult {
  success: boolean;
}
