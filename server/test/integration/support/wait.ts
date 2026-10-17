import type { EmailStatus } from '@prisma/client';
import type { Queue, QueueEvents } from 'bullmq';
import type { PrismaService } from '../../../src/prisma/prisma.service';

/** Resolves with the job's return value when the real worker finishes it; rejects when it fails */
export async function waitForJob(
  ctx: { queue: Queue; queueEvents: QueueEvents },
  jobId: string,
  timeoutMs = 15_000,
) {
  const job = await ctx.queue.getJob(jobId);
  if (!job) throw new Error(`job ${jobId} not found in the queue`);
  return job.waitUntilFinished(ctx.queueEvents, timeoutMs);
}

/** Polls email_logs.status until it equals `status` (e.g. FAILED after the last retry) */
export async function waitForStatus(
  prisma: PrismaService,
  emailLogId: string,
  status: EmailStatus,
  timeoutMs = 15_000,
) {
  const deadline = Date.now() + timeoutMs;
  let last: string | undefined;
  for (;;) {
    const row = await prisma.emailLog.findUnique({ where: { id: emailLogId } });
    last = row?.status;
    if (row?.status === status) return row;
    if (Date.now() > deadline) {
      throw new Error(`email log ${emailLogId} did not reach ${status} in ${timeoutMs} ms (last: ${last})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
