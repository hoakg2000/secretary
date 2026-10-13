import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FinanceService } from './finance.service';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';

function build(overrides: Record<string, any> = {}) {
  const tx = {
    bankAccount: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({ id: ACCOUNT }),
    },
    transaction: {
      create: vi.fn().mockResolvedValue({ id: 't1' }),
      delete: vi.fn(),
    },
  };
  const prisma: any = {
    tx,
    bankAccount: {
      findUnique: vi.fn().mockResolvedValue({ id: ACCOUNT, isActive: true }),
      update: vi.fn().mockImplementation(async ({ data }) => ({ id: ACCOUNT, ...data })),
      delete: vi.fn(),
    },
    category: { findUnique: vi.fn() },
    emailLog: { findUnique: vi.fn() },
    transaction: { findUnique: vi.fn(), count: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn(tx)),
    ...overrides,
  };
  return { prisma, tx, service: new FinanceService(prisma) };
}

const dto = {
  accountId: ACCOUNT,
  amount: 50000.5,
  type: 'EXPENSE' as const,
  transactionTime: new Date(),
};

describe('FinanceService balances', () => {
  it('createTransaction decrements atomically and never writes an absolute balance', async () => {
    const { tx, service } = build();
    await service.createTransaction(dto);

    expect(tx.bankAccount.update).toHaveBeenCalledWith({
      where: { id: ACCOUNT },
      data: { cachedBalance: { decrement: new Prisma.Decimal('50000.5') } },
    });
  });

  it('createTransaction increments for income', async () => {
    const { tx, service } = build();
    await service.createTransaction({ ...dto, type: 'INCOME' });
    expect(tx.bankAccount.update.mock.calls[0][0].data.cachedBalance).toEqual({
      increment: new Prisma.Decimal('50000.5'),
    });
  });

  it('deleteTransaction applies the opposite movement inside the transaction', async () => {
    const { prisma, tx, service } = build();
    const amount = new Prisma.Decimal('120.25');
    prisma.transaction.findUnique.mockResolvedValue({
      id: 't1',
      accountId: ACCOUNT,
      type: 'EXPENSE',
      amount,
    });

    await service.deleteTransaction('t1');

    expect(tx.transaction.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
    expect(tx.bankAccount.update).toHaveBeenCalledWith({
      where: { id: ACCOUNT },
      data: { cachedBalance: { increment: amount } },
    });
  });

  it('adjustBalance records the difference as one transaction', async () => {
    const { tx, service } = build();
    tx.bankAccount.findUnique.mockResolvedValue({
      id: ACCOUNT,
      cachedBalance: new Prisma.Decimal('1000.00'),
    });

    await service.adjustBalance(ACCOUNT, { newBalance: 750.5 });

    const created = tx.transaction.create.mock.calls[0][0].data;
    expect(created.type).toBe('EXPENSE');
    expect(created.amount.toString()).toBe('249.5');
    expect(
      tx.bankAccount.update.mock.calls[0][0].data.cachedBalance.increment.toString(),
    ).toBe('-249.5');
  });

  it('adjustBalance is a no-op when the balance already matches', async () => {
    const { tx, service } = build();
    tx.bankAccount.findUnique.mockResolvedValue({
      id: ACCOUNT,
      cachedBalance: new Prisma.Decimal('1000.00'),
    });
    await service.adjustBalance(ACCOUNT, { newBalance: 1000 });
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });
});

describe('FinanceService integrity', () => {
  it('rejects a category of the opposite type', async () => {
    const { prisma, service } = build();
    prisma.category.findUnique.mockResolvedValue({ id: 'c1', type: 'INCOME' });
    await expect(
      service.createTransaction({ ...dto, categoryId: 'c1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an inactive account', async () => {
    const { prisma, service } = build();
    prisma.bankAccount.findUnique.mockResolvedValue({ id: ACCOUNT, isActive: false });
    await expect(service.createTransaction(dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('deactivates instead of deleting an account that has transactions', async () => {
    const { prisma, service } = build();
    prisma.transaction.count.mockResolvedValue(3);
    const result = await service.deleteBankAccount(ACCOUNT);
    expect(result).toMatchObject({ isActive: false });
    expect(prisma.bankAccount.delete).not.toHaveBeenCalled();
  });
});
