import { apiFetch } from "../client";
import type {
  EmailIngestInput,
  EmailLog,
  EmailLogSummary,
  EmailRule,
  EmailRuleInput,
  EmailRuleType,
  Id,
  ListEmailLogQuery,
  Paginated,
} from "../types";

export const listEmailLogs = (query?: ListEmailLogQuery) =>
  apiFetch<Paginated<EmailLogSummary>>("/email/logs", { query });
export const getEmailLog = (id: Id) => apiFetch<EmailLog>(`/email/logs/${id}`);
/** Only for FAILED logs (400 otherwise). */
export const reprocessEmailLog = (id: Id) =>
  apiFetch<unknown>(`/email/logs/${id}/reprocess`, { method: "POST" });
/** `null` when the messageId was already processed. */
export const ingestEmail = (input: EmailIngestInput) =>
  apiFetch<EmailLog | null>("/email/ingest", { method: "POST", json: input });

export const listEmailRules = (type?: EmailRuleType) =>
  apiFetch<EmailRule[]>("/email-rules", { query: { type } });
export const getEmailRule = (id: Id) => apiFetch<EmailRule>(`/email-rules/${id}`);
export const createEmailRule = (input: EmailRuleInput) =>
  apiFetch<EmailRule>("/email-rules", { method: "POST", json: input });
export const updateEmailRule = (id: Id, input: Partial<EmailRuleInput>) =>
  apiFetch<EmailRule>(`/email-rules/${id}`, { method: "PATCH", json: input });
export const deleteEmailRule = (id: Id) => apiFetch<null>(`/email-rules/${id}`, { method: "DELETE" });
