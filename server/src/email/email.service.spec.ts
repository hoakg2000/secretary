import { Prisma } from '@prisma/client';
import { EmailService } from './email.service';

const dto = { messageId: '<m1@mail>', sender: 'Bank <no-reply@bank.vn>' };

function build(ruleType: string | null = null) {
  const prisma: any = {
    emailLog: {
      create: vi.fn().mockResolvedValue({ id: 'log1', ...dto, subject: null, rawBody: null }),
      update: vi.fn(),
    },
  };
  const rules: any = { classify: vi.fn().mockResolvedValue(ruleType) };
  const queue: any = { add: vi.fn().mockResolvedValue({ id: 'log1' }) };
  return { prisma, queue, service: new EmailService(prisma, rules, queue) };
}

describe('EmailService.createEmailLog', () => {
  it('returns null on a duplicate message_id (P2002)', async () => {
    const { prisma, service } = build();
    prisma.emailLog.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(service.createEmailLog(dto)).resolves.toBeNull();
  });

  it('lets any other error propagate', async () => {
    const { prisma, service } = build();
    prisma.emailLog.create.mockRejectedValue(new Error('connection lost'));
    await expect(service.createEmailLog(dto)).rejects.toThrow('connection lost');
  });
});

describe('EmailService.ingest', () => {
  it('saves a blacklisted email as SKIPPED and does not enqueue', async () => {
    const { prisma, queue, service } = build('blacklist');
    const result = await service.ingest(dto);

    expect(queue.add).not.toHaveBeenCalled();
    expect(prisma.emailLog.update).toHaveBeenCalledWith({
      where: { id: 'log1' },
      data: { status: 'SKIPPED' },
    });
    expect(result).toMatchObject({ jobId: null, status: 'SKIPPED' });
  });

  it('enqueues moneylist mail first, keyed by the email log id, with retries', async () => {
    const { queue, service } = build('moneylist');
    await service.ingest(dto);

    const [, data, opts] = queue.add.mock.calls[0];
    expect(data.ruleType).toBe('moneylist');
    expect(opts).toMatchObject({ jobId: 'log1', priority: 1, attempts: 3 });
  });

  it('gives unmatched mail the lowest priority', async () => {
    const { queue, service } = build(null);
    await service.ingest(dto);
    expect(queue.add.mock.calls[0][2].priority).toBe(3);
  });
});
