import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { FinanceService } from '../../src/finance/finance.service';
import { createTestModule, resetDb, seedAccount, TestContext } from './harness';

describe('FinanceService (integration)', () => {
  let ctx: TestContext;
  let finance: FinanceService;

  beforeAll(async () => {
    ctx = await createTestModule();
    finance = ctx.moduleRef.get(FinanceService);
  });
  beforeEach(() => resetDb(ctx.prisma));
  afterAll(() => ctx.moduleRef.close());

  const balance = async (id: string) =>
    (await ctx.prisma.bankAccount.findUniqueOrThrow({ where: { id } })).cachedBalance.toFixed(2);

  const tx = (accountId: string, overrides: any = {}) => ({
    accountId,
    amount: 100,
    type: 'EXPENSE' as const,
    transactionTime: new Date('2026-10-10T10:00:00Z'),
    ...overrides,
  });

  const seedEmailLog = () =>
    ctx.prisma.emailLog.create({ data: { messageId: randomUUID(), sender: 'bank@test' } });

  it('createTransaction moves the balance by the exact decimal', async () => {
    const account = await seedAccount(ctx.prisma);

    const expense = await finance.createTransaction(tx(account.id, { amount: 50000.5 }));
    expect(await balance(account.id)).toBe('949999.50');

    await finance.createTransaction(tx(account.id, { amount: 50000.5, type: 'INCOME' }));
    expect(await balance(account.id)).toBe('1000000.00');

    const [row] = await ctx.prisma.$queryRaw<{ amount: string }[]>`
      SELECT amount::text AS amount FROM transactions WHERE id = ${expense.id}`;
    expect(row.amount).toBe('50000.50');
  });

  it('20 concurrent createTransaction on one account lose no update', async () => {
    const account = await seedAccount(ctx.prisma);

    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        finance.createTransaction(
          tx(account.id, i % 2 ? { amount: 1.01, type: 'INCOME' } : { amount: 0.5 }),
        ),
      ),
    );

    expect(await balance(account.id)).toBe('1000005.10');
    expect(await ctx.prisma.transaction.count()).toBe(20);
  });

  it('rejects unknown / inactive account, wrong category type and unknown email log without touching the balance', async () => {
    const account = await seedAccount(ctx.prisma);
    const inactive = await seedAccount(ctx.prisma, { isActive: false });
    const income = await finance.createCategory({ name: 'Salary', type: 'INCOME' });

    await expect(finance.createTransaction(tx(randomUUID()))).rejects.toBeInstanceOf(NotFoundException);
    await expect(finance.createTransaction(tx(inactive.id))).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      finance.createTransaction(tx(account.id, { categoryId: income.id })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      finance.createTransaction(tx(account.id, { emailLogId: randomUUID() })),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(await balance(account.id)).toBe('1000000.00');
    expect(await balance(inactive.id)).toBe('1000000.00');
    expect(await ctx.prisma.transaction.count()).toBe(0);
  });

  it('a second transaction for the same email log fails with P2002 and its balance update is rolled back', async () => {
    const account = await seedAccount(ctx.prisma);
    const emailLog = await seedEmailLog();

    await finance.createTransaction(tx(account.id, { emailLogId: emailLog.id }));
    await expect(
      finance.createTransaction(tx(account.id, { emailLogId: emailLog.id })),
    ).rejects.toMatchObject({ code: 'P2002' });

    expect(await balance(account.id)).toBe('999900.00');
    expect(await ctx.prisma.transaction.count()).toBe(1);
  });

  it('deleteTransaction restores the balance', async () => {
    const account = await seedAccount(ctx.prisma);
    const expense = await finance.createTransaction(tx(account.id, { amount: 250.25 }));
    const income = await finance.createTransaction(tx(account.id, { amount: 10, type: 'INCOME' }));

    await finance.deleteTransaction(expense.id);
    expect(await balance(account.id)).toBe('1000010.00');
    await finance.deleteTransaction(income.id);
    expect(await balance(account.id)).toBe('1000000.00');
    expect(await ctx.prisma.transaction.count()).toBe(0);

    await expect(finance.deleteTransaction(randomUUID())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('adjustBalance records the difference as one adjustment transaction', async () => {
    const account = await seedAccount(ctx.prisma);

    await finance.adjustBalance(account.id, { newBalance: 1000500.5 });
    expect(await balance(account.id)).toBe('1000500.50');
    await finance.adjustBalance(account.id, { newBalance: 900000, note: 'recount' });
    expect(await balance(account.id)).toBe('900000.00');
    await finance.adjustBalance(account.id, { newBalance: 900000 });

    const rows = await ctx.prisma.transaction.findMany({ orderBy: { createdAt: 'asc' } });
    expect(rows.map((r) => [r.type, r.amount.toFixed(2), r.note])).toEqual([
      ['INCOME', '500.50', 'Manual balance adjustment'],
      ['EXPENSE', '100500.50', 'recount'],
    ]);

    await expect(finance.adjustBalance(randomUUID(), { newBalance: 1 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('deleteBankAccount deactivates an account with transactions and removes one without', async () => {
    const used = await seedAccount(ctx.prisma);
    const unused = await seedAccount(ctx.prisma);
    await finance.createTransaction(tx(used.id));

    await finance.deleteBankAccount(used.id);
    await finance.deleteBankAccount(unused.id);

    expect(await ctx.prisma.bankAccount.findUnique({ where: { id: used.id } })).toMatchObject({
      isActive: false,
    });
    expect(await ctx.prisma.bankAccount.findUnique({ where: { id: unused.id } })).toBeNull();
    expect(await ctx.prisma.transaction.count()).toBe(1);
  });

  it('getAllBankAccounts hides inactive accounts; getTotalBalance groups active accounts by currency', async () => {
    await seedAccount(ctx.prisma, { cachedBalance: 100.25 });
    await seedAccount(ctx.prisma, { cachedBalance: 200.5 });
    await seedAccount(ctx.prisma, { cachedBalance: 30, currency: 'USD' });
    await seedAccount(ctx.prisma, { cachedBalance: 999, isActive: false });

    expect(await finance.getAllBankAccounts()).toHaveLength(3);
    expect(await finance.getAllBankAccounts(true)).toHaveLength(4);

    const { totals } = await finance.getTotalBalance();
    expect(
      totals
        .map((t) => [t.currency, t.totalBalance.toFixed(2), t.totalAccounts])
        .sort(),
    ).toEqual([
      ['USD', '30.00', 1],
      ['VND', '300.75', 2],
    ]);
  });

  it('deleteCategory keeps its transactions with categoryId = null', async () => {
    const account = await seedAccount(ctx.prisma);
    const category = await finance.createCategory({ name: 'Food', type: 'EXPENSE' });
    const created = await finance.createTransaction(tx(account.id, { categoryId: category.id }));

    await finance.deleteCategory(category.id);

    expect(await ctx.prisma.transaction.findUnique({ where: { id: created.id } })).toMatchObject({
      categoryId: null,
    });
  });

  it('getAllTransactions filters, bounds dates inclusively, sorts newest first and pages', async () => {
    const a = await seedAccount(ctx.prisma);
    const b = await seedAccount(ctx.prisma);
    const food = await finance.createCategory({ name: 'Food', type: 'EXPENSE' });
    const day = (d: number) => new Date(Date.UTC(2026, 9, d));

    const t1 = await finance.createTransaction(tx(a.id, { transactionTime: day(1) }));
    const t2 = await finance.createTransaction(
      tx(a.id, { transactionTime: day(2), categoryId: food.id }),
    );
    const t3 = await finance.createTransaction(tx(a.id, { transactionTime: day(3), type: 'INCOME' }));
    const t4 = await finance.createTransaction(tx(b.id, { transactionTime: day(4) }));

    const ids = async (filter: any) => (await finance.getAllTransactions(filter)).items.map((t) => t.id);

    expect(await ids({})).toEqual([t4.id, t3.id, t2.id, t1.id]);
    expect(await ids({ accountId: b.id })).toEqual([t4.id]);
    expect(await ids({ categoryId: food.id })).toEqual([t2.id]);
    expect(await ids({ type: 'INCOME' })).toEqual([t3.id]);
    expect(await ids({ startDate: day(2), endDate: day(3) })).toEqual([t3.id, t2.id]);
    expect(await ids({ startDate: day(4) })).toEqual([t4.id]);
    expect(await ids({ endDate: day(1) })).toEqual([t1.id]);

    const page = await finance.getAllTransactions({ page: 2, pageSize: 3 });
    expect(page).toMatchObject({ total: 4, page: 2, pageSize: 3 });
    expect(page.items.map((t) => t.id)).toEqual([t1.id]);
  });

  it('getBankAccountById returns at most 10 transactions, newest first', async () => {
    const account = await seedAccount(ctx.prisma);
    for (let d = 1; d <= 12; d++) {
      await finance.createTransaction(
        tx(account.id, { amount: d, transactionTime: new Date(Date.UTC(2026, 9, d)) }),
      );
    }

    const { transactions } = await finance.getBankAccountById(account.id);

    expect(transactions.map((t) => Number(t.amount))).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
  });
});
