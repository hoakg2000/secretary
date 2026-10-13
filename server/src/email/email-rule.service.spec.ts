import { BadRequestException } from '@nestjs/common';
import { EmailRuleService } from './email-rule.service';

function build(rules: any[]) {
  const prisma: any = {
    emailRule: {
      findMany: vi.fn().mockResolvedValue(rules),
      create: vi.fn().mockImplementation(async ({ data }) => data),
    },
  };
  return new EmailRuleService(prisma);
}

const email = {
  sender: 'Promo <promo@bank.vn>',
  subject: 'Biến động số dư',
  rawBody: 'TK 1012 +500,000 VND',
};

describe('EmailRuleService.classify', () => {
  it('blacklist wins even when the whitelist rule is older', async () => {
    const service = build([
      { type: 'whitelist', matcher: 'sender', matchValue: 'bank.vn' }, // older
      { type: 'blacklist', matcher: 'sender', matchValue: 'promo@' }, // newer
    ]);
    await expect(service.classify(email)).resolves.toBe('blacklist');
  });

  it('moneylist beats whitelist; no match gives null', async () => {
    const service = build([
      { type: 'whitelist', matcher: 'keyword', matchValue: 'số dư' },
      { type: 'moneylist', matcher: 'regex', matchValue: '[+-][\\d,]+ VND' },
    ]);
    await expect(service.classify(email)).resolves.toBe('moneylist');
    await expect(
      service.classify({ sender: 'a@b.c', subject: 'hi', rawBody: '' }),
    ).resolves.toBeNull();
  });
});

describe('EmailRuleService regex validation', () => {
  const base = { type: 'whitelist', matcher: 'regex' } as any;

  it('rejects an invalid or over-long regex on create', async () => {
    const service = build([]);
    await expect(
      service.create({ ...base, matchValue: '([a-z' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create({ ...base, matchValue: 'a'.repeat(201) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a valid regex', async () => {
    await expect(
      build([]).create({ ...base, matchValue: '^VCB' }),
    ).resolves.toMatchObject({ matchValue: '^VCB' });
  });
});
