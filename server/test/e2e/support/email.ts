import { serverErrorsSince } from './app';
import { stopIfThirdParty } from './classify';
import { api, note, waitFor } from './http';

export interface EmailLogRow {
  id: string;
  messageId: string;
  sender: string;
  subject: string | null;
  aiSummary: string | null;
  status: 'PENDING' | 'PROCESSED' | 'SKIPPED' | 'FAILED';
}

export const uniqueMessageId = (label: string) => `<e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.local>`;

/** POST /email/ingest; returns the HTTP result (data is null for a duplicate messageId) */
export function ingest(
  token: string,
  email: { messageId: string; sender: string; subject?: string; rawBody?: string },
) {
  return api<{ data: { emailLogId: string; jobId: string | null; status: string } | null }>('POST', '/email/ingest', {
    token,
    body: email,
  });
}

/**
 * Polls GET /email/logs until the log leaves PENDING. A FAILED log is explained from the server's error log
 * (the retries of the worker end there) and stops the run when the cause is a provider failure.
 */
export async function waitForEmailDone(token: string, emailLogId: string, timeout = 90_000): Promise<EmailLogRow> {
  const row = await waitFor(
    async () => {
      const { body } = await api<{ data: { items: EmailLogRow[] } }>('GET', '/email/logs?pageSize=50', {
        token,
        quiet: true,
      });
      const found = body.data.items.find((item) => item.id === emailLogId);
      return found && found.status !== 'PENDING' ? found : undefined;
    },
    { timeout, interval: 2_000, label: `email log ${emailLogId} to leave PENDING` },
  );
  note(`email log ${emailLogId} -> ${row.status}, summary: ${row.aiSummary ?? '(none)'}`);
  if (row.status === 'FAILED') {
    const logged = serverErrorsSince();
    stopIfThirdParty(`email worker (log ${emailLogId})`, logged);
    throw new Error(`email log ${emailLogId} ended FAILED. Server errors: ${logged.slice(0, 800) || '(none logged)'}`);
  }
  return row;
}
