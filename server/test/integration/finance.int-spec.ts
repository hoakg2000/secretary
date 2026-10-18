import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateBankAccountDto } from '../../src/finance/dto/update-bank-account.dto';
import { FinanceService } from '../../src/finance/finance.service';
import { MISSING, createTestModule, resetState, seedAccount, type TestContext } from './harness';

const { INCOME, EXPENSE } = TransactionType;
const at = (iso: string) => new Date(iso);

describe('finance integration', () => {
  let ctx: TestContext;
  let service: FinanceService;

  beforeAll(async () => {
    ctx = await createTestModule();
    service = ctx.moduleRef.get(FinanceService);
  });

  afterAll(() => ctx.close());

  beforeEach(() => resetState(ctx));

  const account = (data: Record<string, unknown> = {}) => seedAccount(ctx.prisma, { cachedBalance: 1000, ...data });
  const category = (data: Record<string, unknown> = {}) =>
    ctx.prisma.category.create({ data: { name: 'Food', type: EXPENSE, ...data } });
  const balanceOf = async (id: string) =>
    (await ctx.prisma.bankAccount.findUniqueOrThrow({ where: { id } })).cachedBalance.toFixed(2);
  const txCount = (where: Record<string, unknown> = {}) => ctx.prisma.transaction.count({ where });
  const seedTx = (accountId: string, data: Record<string, unknown> = {}) =>
    ctx.prisma.transaction.create({
      data: { accountId, amount: 10, type: EXPENSE, transactionTime: at('2030-01-01T00:00:00Z'), ...data },
    });
  const txDto = (accountId: string, data: Record<string, unknown> = {}) => ({
    accountId,
    amount: 100,
    type: EXPENSE,
    transactionTime: at('2030-01-01T00:00:00Z'),
    ...data,
  });

  // ---------------------------------------------------------------- bank accounts

  describe('createBankAccount', () => {
    it('persists the account with defaults VND, active, zero balance', async () => {
      const result = await service.createBankAccount({ accountName: 'A', bankCode: 'MB', accountNumber: '1' });

      expect(result).toMatchObject({ currency: 'VND', isActive: true });
      expect(result.cachedBalance.toFixed(2)).toBe('0.00');
      const row = await ctx.prisma.bankAccount.findUniqueOrThrow({ where: { id: result.id } });
      expect(row).toMatchObject({ accountName: 'A', bankCode: 'MB', accountNumber: '1', currency: 'VND', isActive: true });
    });

    it('stores a given balance, currency and inactive flag with two decimals', async () => {
      const result = await service.createBankAccount({
        accountName: 'U',
        bankCode: 'X',
        accountNumber: '2',
        cachedBalance: 12.5,
        currency: 'USD',
        isActive: false,
      });

      const row = await ctx.prisma.bankAccount.findUniqueOrThrow({ where: { id: result.id } });
      expect(row.cachedBalance.toFixed(2)).toBe('12.50');
      expect(row).toMatchObject({ currency: 'USD', isActive: false });
    });
  });

  describe('getAllBankAccounts', () => {
    it('returns only active accounts, newest first, by default', async () => {
      const older = await account({ accountName: 'Old', createdAt: at('2024-01-01T00:00:00Z') });
      const newer = await account({ accountName: 'New', createdAt: at('2025-01-01T00:00:00Z') });
      await account({ accountName: 'Closed', isActive: false });

      const result = await service.getAllBankAccounts();

      expect(result.map((a) => a.id)).toEqual([newer.id, older.id]);
    });

    it('includes inactive accounts when asked', async () => {
      await account();
      await account({ isActive: false });

      expect(await service.getAllBankAccounts(true)).toHaveLength(2);
    });

    it('returns an empty list when there are no accounts', async () => {
      expect(await service.getAllBankAccounts()).toEqual([]);
    });
  });

  describe('getBankAccountById', () => {
    it('returns the account with its 10 latest transactions, newest first', async () => {
      const acc = await account();
      for (let day = 1; day <= 12; day++) {
        await seedTx(acc.id, { transactionTime: new Date(Date.UTC(2030, 0, day)) });
      }

      const result = await service.getBankAccountById(acc.id);

      expect(result.transactions).toHaveLength(10);
      expect(result.transactions[0].transactionTime).toEqual(at('2030-01-12T00:00:00Z'));
      expect(result.transactions[9].transactionTime).toEqual(at('2030-01-03T00:00:00Z'));
    });

    it('throws NotFound for an unknown id', async () => {
      await expect(service.getBankAccountById(MISSING)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateBankAccount', () => {
    it('updates the given fields and leaves the balance and other fields alone', async () => {
      const acc = await account({ cachedBalance: 500.5 });

      const result = await service.updateBankAccount(acc.id, { accountName: 'Renamed', isActive: false });

      expect(result.accountName).toBe('Renamed');
      const row = await ctx.prisma.bankAccount.findUniqueOrThrow({ where: { id: acc.id } });
      expect(row).toMatchObject({ accountName: 'Renamed', isActive: false, bankCode: 'VCB' });
      expect(row.cachedBalance.toFixed(2)).toBe('500.50');
    });

    it('rejects null on non-nullable fields in the update DTO (400) and leaves the row unchanged', async () => {
      const acc = await account();

      for (const field of ['accountName', 'bankCode', 'accountNumber', 'currency', 'isActive']) {
        const errors = await validate(plainToInstance(UpdateBankAccountDto, { [field]: null }));
        expect(errors.map((e) => e.property), field).toEqual([field]);
      }
      const row = await ctx.prisma.bankAccount.findUniqueOrThrow({ where: { id: acc.id } });
      expect(row).toMatchObject({ accountName: acc.accountName, isActive: acc.isActive, currency: acc.currency });
    });

    it('throws NotFound for an unknown id', async () => {
      await expect(service.updateBankAccount(MISSING, { accountName: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deleteBankAccount', () => {
    it('hard-deletes an account without transactions', async () => {
      const acc = await account();

      expect(await service.deleteBankAccount(acc.id)).toEqual({ success: true });

      expect(await ctx.prisma.bankAccount.findUnique({ where: { id: acc.id } })).toBeNull();
    });

    it('soft-deactivates an account that has transactions and keeps them', async () => {
      const acc = await account();
      await seedTx(acc.id);

      const result = await service.deleteBankAccount(acc.id);

      expect(result).toMatchObject({ id: acc.id, isActive: false });
      const row = await ctx.prisma.bankAccount.findUniqueOrThrow({ where: { id: acc.id } });
      expect(row.isActive).toBe(false);
      expect(await txCount({ accountId: acc.id })).toBe(1);
    });

    it('throws NotFound for an unknown id', async () => {
      await expect(service.deleteBankAccount(MISSING)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('adjustBalance', () => {
    it('records an INCOME adjustment for a higher balance', async () => {
      const acc = await account({ cachedBalance: 1000 });

      const result = await service.adjustBalance(acc.id, { newBalance: 1250.75, note: 'recon' });

      expect(result.cachedBalance.toFixed(2)).toBe('1250.75');
      expect(await balanceOf(acc.id)).toBe('1250.75');
      const txs = await ctx.prisma.transaction.findMany({ where: { accountId: acc.id } });
      expect(txs).toHaveLength(1);
      expect(txs[0]).toMatchObject({ type: INCOME, note: 'recon' });
      expect(txs[0].amount.toFixed(2)).toBe('250.75');
    });

    it('records an EXPENSE adjustment with the default note for a lower balance', async () => {
      const acc = await account({ cachedBalance: 1000 });

      await service.adjustBalance(acc.id, { newBalance: 400.25 });

      expect(await balanceOf(acc.id)).toBe('400.25');
      const txs = await ctx.prisma.transaction.findMany({ where: { accountId: acc.id } });
      expect(txs).toHaveLength(1);
      expect(txs[0]).toMatchObject({ type: EXPENSE, note: 'Manual balance adjustment' });
      expect(txs[0].amount.toFixed(2)).toBe('599.75');
    });

    it('allows a negative new balance', async () => {
      const acc = await account({ cachedBalance: 100 });

      await service.adjustBalance(acc.id, { newBalance: -50 });

      expect(await balanceOf(acc.id)).toBe('-50.00');
      const [tx] = await ctx.prisma.transaction.findMany({ where: { accountId: acc.id } });
      expect(tx.type).toBe(EXPENSE);
      expect(tx.amount.toFixed(2)).toBe('150.00');
    });

    it('does nothing when the balance already matches', async () => {
      const acc = await account({ cachedBalance: 1000 });

      const result = await service.adjustBalance(acc.id, { newBalance: 1000 });

      expect(result.id).toBe(acc.id);
      expect(await balanceOf(acc.id)).toBe('1000.00');
      expect(await txCount()).toBe(0);
    });

    it('throws NotFound for an unknown account and writes nothing', async () => {
      await expect(service.adjustBalance(MISSING, { newBalance: 5 })).rejects.toBeInstanceOf(NotFoundException);
      expect(await txCount()).toBe(0);
    });
  });

  describe('getTotalBalance', () => {
    it('sums active accounts per currency and ignores inactive ones', async () => {
      await account({ cachedBalance: 100.1 });
      await account({ cachedBalance: 200.2 });
      await account({ cachedBalance: 999, isActive: false });
      await account({ cachedBalance: 50, currency: 'USD' });

      const { totals } = await service.getTotalBalance();

      const byCurrency = Object.fromEntries(totals.map((t) => [t.currency, t]));
      expect(totals).toHaveLength(2);
      expect(byCurrency.VND.totalBalance.toFixed(2)).toBe('300.30');
      expect(byCurrency.VND.totalAccounts).toBe(2);
      expect(byCurrency.USD.totalBalance.toFixed(2)).toBe('50.00');
      expect(byCurrency.USD.totalAccounts).toBe(1);
    });

    it('returns no totals when there are no active accounts', async () => {
      await account({ isActive: false });

      expect(await service.getTotalBalance()).toEqual({ totals: [] });
    });
  });

  // ---------------------------------------------------------------- categories

  describe('createCategory', () => {
    it('persists name, type, icon and budget limit', async () => {
      const result = await service.createCategory({ name: 'Food', type: EXPENSE, icon: 'utensils', budgetLimit: 3000.5 });

      const row = await ctx.prisma.category.findUniqueOrThrow({ where: { id: result.id } });
      expect(row).toMatchObject({ name: 'Food', type: EXPENSE, icon: 'utensils' });
      expect(row.budgetLimit?.toFixed(2)).toBe('3000.50');
    });

    it('leaves icon and budget limit null when omitted', async () => {
      const result = await service.createCategory({ name: 'Salary', type: INCOME });

      const row = await ctx.prisma.category.findUniqueOrThrow({ where: { id: result.id } });
      expect(row).toMatchObject({ icon: null, budgetLimit: null });
    });
  });

  describe('getAllCategories', () => {
    it('returns all categories ordered by name', async () => {
      await category({ name: 'b' });
      await category({ name: 'a', type: INCOME });

      const result = await service.getAllCategories();

      expect(result.map((c) => c.name)).toEqual(['a', 'b']);
    });

    it('filters by type', async () => {
      await category({ name: 'Food', type: EXPENSE });
      await category({ name: 'Salary', type: INCOME });

      const result = await service.getAllCategories(INCOME);

      expect(result.map((c) => c.name)).toEqual(['Salary']);
    });
  });

  describe('getCategoryById', () => {
    it('returns the category', async () => {
      const cat = await category();

      expect(await service.getCategoryById(cat.id)).toMatchObject({ id: cat.id, name: 'Food' });
    });

    it('throws NotFound for an unknown id', async () => {
      await expect(service.getCategoryById(MISSING)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateCategory', () => {
    it('updates the name and keeps the type', async () => {
      const cat = await category({ name: 'Food', type: EXPENSE });

      await service.updateCategory(cat.id, { name: 'Dining' });

      const row = await ctx.prisma.category.findUniqueOrThrow({ where: { id: cat.id } });
      expect(row).toMatchObject({ name: 'Dining', type: EXPENSE });
    });

    it('treats a null name as unchanged', async () => {
      const cat = await category({ name: 'Food' });

      await service.updateCategory(cat.id, { name: null, icon: 'new' } as never);

      const row = await ctx.prisma.category.findUniqueOrThrow({ where: { id: cat.id } });
      expect(row).toMatchObject({ name: 'Food', icon: 'new' });
    });

    it('clears icon and budget limit when given null', async () => {
      const cat = await category({ icon: 'utensils', budgetLimit: 100 });

      await service.updateCategory(cat.id, { icon: null, budgetLimit: null } as never);

      const row = await ctx.prisma.category.findUniqueOrThrow({ where: { id: cat.id } });
      expect(row).toMatchObject({ icon: null, budgetLimit: null });
    });

    it('throws NotFound for an unknown id', async () => {
      await expect(service.updateCategory(MISSING, { name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deleteCategory', () => {
    it('deletes the category and leaves its transactions with a null category', async () => {
      const acc = await account();
      const cat = await category();
      const tx = await seedTx(acc.id, { categoryId: cat.id });

      expect(await service.deleteCategory(cat.id)).toEqual({ success: true });

      expect(await ctx.prisma.category.findUnique({ where: { id: cat.id } })).toBeNull();
      const row = await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } });
      expect(row.categoryId).toBeNull();
    });

    it('throws NotFound for an unknown id', async () => {
      await expect(service.deleteCategory(MISSING)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ---------------------------------------------------------------- transactions

  describe('createTransaction', () => {
    it('decreases the balance for an EXPENSE and stores the row', async () => {
      const acc = await account({ cachedBalance: 1000 });
      const cat = await category();

      const result = await service.createTransaction(
        txDto(acc.id, { amount: 123.45, categoryId: cat.id, counterparty: 'Shop', note: 'lunch' }),
      );

      expect(result.account.id).toBe(acc.id);
      expect(result.category?.id).toBe(cat.id);
      expect(await balanceOf(acc.id)).toBe('876.55');
      const row = await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: result.id } });
      expect(row).toMatchObject({
        accountId: acc.id,
        categoryId: cat.id,
        type: EXPENSE,
        counterparty: 'Shop',
        note: 'lunch',
        transactionTime: at('2030-01-01T00:00:00Z'),
      });
      expect(row.amount.toFixed(2)).toBe('123.45');
    });

    it('increases the balance for an INCOME', async () => {
      const acc = await account({ cachedBalance: 1000 });

      await service.createTransaction(txDto(acc.id, { amount: 0.01, type: INCOME }));

      expect(await balanceOf(acc.id)).toBe('1000.01');
    });

    it('allows the balance to go negative', async () => {
      const acc = await account({ cachedBalance: 10 });

      await service.createTransaction(txDto(acc.id, { amount: 50 }));

      expect(await balanceOf(acc.id)).toBe('-40.00');
    });

    it('throws NotFound for an unknown account', async () => {
      await expect(service.createTransaction(txDto(MISSING))).rejects.toBeInstanceOf(NotFoundException);
      expect(await txCount()).toBe(0);
    });

    it('rejects an inactive account with 400 and changes nothing', async () => {
      const acc = await account({ isActive: false });

      await expect(service.createTransaction(txDto(acc.id))).rejects.toBeInstanceOf(BadRequestException);

      expect(await txCount()).toBe(0);
      expect(await balanceOf(acc.id)).toBe('1000.00');
    });

    it('rejects a category of the other type with 400 and changes nothing', async () => {
      const acc = await account();
      const cat = await category({ type: INCOME });

      await expect(service.createTransaction(txDto(acc.id, { categoryId: cat.id, type: EXPENSE }))).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(await txCount()).toBe(0);
      expect(await balanceOf(acc.id)).toBe('1000.00');
    });

    it('throws NotFound for an unknown category', async () => {
      const acc = await account();

      await expect(service.createTransaction(txDto(acc.id, { categoryId: MISSING }))).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(await balanceOf(acc.id)).toBe('1000.00');
    });

    it('throws NotFound for an unknown emailLogId and changes nothing', async () => {
      const acc = await account();

      await expect(service.createTransaction(txDto(acc.id, { emailLogId: MISSING }))).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(await txCount()).toBe(0);
      expect(await balanceOf(acc.id)).toBe('1000.00');
    });

    it('links the transaction to an email log', async () => {
      const acc = await account();
      const log = await ctx.prisma.emailLog.create({ data: { messageId: 'm1', sender: 's@x.com' } });

      const result = await service.createTransaction(txDto(acc.id, { emailLogId: log.id }));

      expect(result.emailLogId).toBe(log.id);
    });

    it('rejects a second transaction for the same emailLogId (P2002) and rolls the balance back', async () => {
      const acc = await account({ cachedBalance: 1000 });
      const log = await ctx.prisma.emailLog.create({ data: { messageId: 'm1', sender: 's@x.com' } });
      await service.createTransaction(txDto(acc.id, { amount: 100, emailLogId: log.id }));
      expect(await balanceOf(acc.id)).toBe('900.00');

      await expect(service.createTransaction(txDto(acc.id, { amount: 100, emailLogId: log.id }))).rejects.toMatchObject({
        code: 'P2002',
      });

      expect(await balanceOf(acc.id)).toBe('900.00');
      expect(await txCount({ emailLogId: log.id })).toBe(1);
    });

    it('keeps the exact balance under 20 parallel transactions on one account', async () => {
      const acc = await account({ cachedBalance: 1000 });
      const incomes = Array.from({ length: 10 }, () => txDto(acc.id, { amount: 100.1, type: INCOME }));
      const expenses = Array.from({ length: 10 }, () => txDto(acc.id, { amount: 50.05, type: EXPENSE }));

      await Promise.all([...incomes, ...expenses].map((dto) => service.createTransaction(dto)));

      // 1000 + 10 * 100.10 - 10 * 50.05
      expect(await balanceOf(acc.id)).toBe('1500.50');
      expect(await txCount({ accountId: acc.id })).toBe(20);
    });
  });

  describe('getAllTransactions', () => {
    it('returns newest first with account and category summaries and the total', async () => {
      const acc = await account();
      const cat = await category();
      await seedTx(acc.id, { transactionTime: at('2030-01-01T00:00:00Z') });
      const newest = await seedTx(acc.id, { transactionTime: at('2030-01-02T00:00:00Z'), categoryId: cat.id });

      const result = await service.getAllTransactions({});

      expect(result).toMatchObject({ total: 2, page: 1, pageSize: 20 });
      expect(result.items[0].id).toBe(newest.id);
      expect(result.items[0].account).toEqual({
        id: acc.id,
        accountName: 'Main',
        bankCode: 'VCB',
        accountNumber: '0011223344',
      });
      expect(result.items[0].category).toEqual({ id: cat.id, name: 'Food', icon: null, type: EXPENSE });
    });

    it('filters by account, category and type', async () => {
      const a = await account();
      const b = await account();
      const cat = await category();
      const target = await seedTx(a.id, { categoryId: cat.id, type: EXPENSE });
      await seedTx(a.id, { type: INCOME });
      await seedTx(b.id, { categoryId: cat.id });

      const result = await service.getAllTransactions({ accountId: a.id, categoryId: cat.id, type: EXPENSE });

      expect(result.items.map((t) => t.id)).toEqual([target.id]);
      expect(result.total).toBe(1);
    });

    it('treats startDate and endDate as inclusive', async () => {
      const acc = await account();
      await seedTx(acc.id, { transactionTime: at('2030-01-01T23:59:59Z') });
      const start = await seedTx(acc.id, { transactionTime: at('2030-01-02T00:00:00Z') });
      const end = await seedTx(acc.id, { transactionTime: at('2030-01-03T00:00:00Z') });
      await seedTx(acc.id, { transactionTime: at('2030-01-03T00:00:01Z') });

      const result = await service.getAllTransactions({
        startDate: at('2030-01-02T00:00:00Z'),
        endDate: at('2030-01-03T00:00:00Z'),
      });

      expect(result.items.map((t) => t.id)).toEqual([end.id, start.id]);
    });

    it('pages results and reports the full total', async () => {
      const acc = await account();
      for (let day = 1; day <= 5; day++) {
        await seedTx(acc.id, { transactionTime: new Date(Date.UTC(2030, 0, day)) });
      }

      const page2 = await service.getAllTransactions({ page: 2, pageSize: 2 });

      expect(page2.total).toBe(5);
      expect(page2.items.map((t) => t.transactionTime)).toEqual([at('2030-01-03T00:00:00Z'), at('2030-01-02T00:00:00Z')]);
      expect((await service.getAllTransactions({ page: 3, pageSize: 2 })).items).toHaveLength(1);
      expect((await service.getAllTransactions({ page: 4, pageSize: 2 })).items).toEqual([]);
    });

    it('returns a page of exactly 100 when pageSize is the maximum', async () => {
      const acc = await account();
      await ctx.prisma.transaction.createMany({
        data: Array.from({ length: 101 }, (_, i) => ({
          accountId: acc.id,
          amount: 1,
          type: EXPENSE,
          transactionTime: new Date(Date.UTC(2030, 0, 1, 0, 0, i)),
        })),
      });

      const result = await service.getAllTransactions({ pageSize: 100 });

      expect(result.items).toHaveLength(100);
      expect(result.total).toBe(101);
    });

    it('returns an empty page when nothing matches', async () => {
      expect(await service.getAllTransactions({})).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    });
  });

  describe('getTransactionById', () => {
    it('returns the transaction with account, category and email log', async () => {
      const acc = await account();
      const cat = await category();
      const log = await ctx.prisma.emailLog.create({ data: { messageId: 'm1', sender: 's@x.com' } });
      const tx = await seedTx(acc.id, { categoryId: cat.id, emailLogId: log.id });

      const result = await service.getTransactionById(tx.id);

      expect(result.account.id).toBe(acc.id);
      expect(result.category?.id).toBe(cat.id);
      expect(result.emailLog?.id).toBe(log.id);
    });

    it('throws NotFound for an unknown id', async () => {
      await expect(service.getTransactionById(MISSING)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateTransaction', () => {
    /** Creates the transaction through the service so balances start consistent */
    const created = async (accountId: string, data: Record<string, unknown> = {}) =>
      service.createTransaction(txDto(accountId, data));

    it('applies only the difference when the amount changes', async () => {
      const acc = await account({ cachedBalance: 1000 });
      const tx = await created(acc.id, { amount: 100 });

      const result = await service.updateTransaction(tx.id, { amount: 130.5 });

      expect(result.amount.toFixed(2)).toBe('130.50');
      expect(await balanceOf(acc.id)).toBe('869.50');
      expect((await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } })).amount.toFixed(2)).toBe('130.50');
    });

    it('flips EXPENSE to INCOME and moves the balance by twice the amount', async () => {
      const acc = await account({ cachedBalance: 1000 });
      const tx = await created(acc.id, { amount: 100, type: EXPENSE });
      expect(await balanceOf(acc.id)).toBe('900.00');

      await service.updateTransaction(tx.id, { type: INCOME });

      expect(await balanceOf(acc.id)).toBe('1100.00');
      expect((await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } })).type).toBe(INCOME);
    });

    it('flips INCOME to EXPENSE', async () => {
      const acc = await account({ cachedBalance: 1000 });
      const tx = await created(acc.id, { amount: 100, type: INCOME });

      await service.updateTransaction(tx.id, { type: EXPENSE });

      expect(await balanceOf(acc.id)).toBe('900.00');
    });

    it('moves the effect from the old account to the new one', async () => {
      const from = await account({ cachedBalance: 1000 });
      const to = await account({ cachedBalance: 500 });
      const tx = await created(from.id, { amount: 100 });

      await service.updateTransaction(tx.id, { accountId: to.id });

      expect(await balanceOf(from.id)).toBe('1000.00');
      expect(await balanceOf(to.id)).toBe('400.00');
      expect((await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } })).accountId).toBe(to.id);
    });

    it('rejects moving to an inactive account and leaves both balances unchanged', async () => {
      const from = await account({ cachedBalance: 1000 });
      const to = await account({ cachedBalance: 500, isActive: false });
      const tx = await created(from.id, { amount: 100 });

      await expect(service.updateTransaction(tx.id, { accountId: to.id })).rejects.toBeInstanceOf(BadRequestException);

      expect(await balanceOf(from.id)).toBe('900.00');
      expect(await balanceOf(to.id)).toBe('500.00');
    });

    it('still edits a transaction whose own account became inactive', async () => {
      const acc = await account({ cachedBalance: 1000 });
      const tx = await created(acc.id, { amount: 100 });
      await ctx.prisma.bankAccount.update({ where: { id: acc.id }, data: { isActive: false } });

      await service.updateTransaction(tx.id, { amount: 150, note: 'fixed' });

      expect(await balanceOf(acc.id)).toBe('850.00');
      expect((await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } })).note).toBe('fixed');
    });

    it('clears the category when categoryId is null', async () => {
      const acc = await account();
      const cat = await category();
      const tx = await created(acc.id, { categoryId: cat.id });

      await service.updateTransaction(tx.id, { categoryId: null } as never);

      expect((await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } })).categoryId).toBeNull();
    });

    it('keeps the category when categoryId is omitted', async () => {
      const acc = await account();
      const cat = await category();
      const tx = await created(acc.id, { categoryId: cat.id });

      await service.updateTransaction(tx.id, { note: 'n' });

      expect((await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } })).categoryId).toBe(cat.id);
    });

    it('treats null amount, type and accountId as unchanged', async () => {
      const acc = await account({ cachedBalance: 1000 });
      const tx = await created(acc.id, { amount: 100 });

      await service.updateTransaction(tx.id, { amount: null, type: null, accountId: null, note: 'n' } as never);

      expect(await balanceOf(acc.id)).toBe('900.00');
      expect(await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } })).toMatchObject({
        type: EXPENSE,
        accountId: acc.id,
        note: 'n',
      });
    });

    it('updates counterparty and transactionTime without touching the balance', async () => {
      const acc = await account({ cachedBalance: 1000 });
      const tx = await created(acc.id, { amount: 100 });

      await service.updateTransaction(tx.id, { counterparty: 'New', transactionTime: at('2031-05-05T00:00:00Z') });

      expect(await balanceOf(acc.id)).toBe('900.00');
      expect(await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } })).toMatchObject({
        counterparty: 'New',
        transactionTime: at('2031-05-05T00:00:00Z'),
      });
    });

    it('rejects a category of the other type before any write', async () => {
      const acc = await account({ cachedBalance: 1000 });
      const income = await category({ type: INCOME });
      const tx = await created(acc.id, { amount: 100 });

      await expect(service.updateTransaction(tx.id, { amount: 500, categoryId: income.id })).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(await balanceOf(acc.id)).toBe('900.00');
      expect((await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } })).amount.toFixed(2)).toBe('100.00');
    });

    it('rejects a type flip that no longer matches the existing category', async () => {
      const acc = await account({ cachedBalance: 1000 });
      const cat = await category({ type: EXPENSE });
      const tx = await created(acc.id, { amount: 100, categoryId: cat.id });

      await expect(service.updateTransaction(tx.id, { type: INCOME })).rejects.toBeInstanceOf(BadRequestException);

      expect(await balanceOf(acc.id)).toBe('900.00');
    });

    it('throws NotFound for an unknown category and leaves the balance unchanged', async () => {
      const acc = await account({ cachedBalance: 1000 });
      const tx = await created(acc.id, { amount: 100 });

      await expect(service.updateTransaction(tx.id, { categoryId: MISSING })).rejects.toBeInstanceOf(NotFoundException);

      expect(await balanceOf(acc.id)).toBe('900.00');
    });

    it('throws NotFound for an unknown target account and leaves the balance unchanged', async () => {
      const acc = await account({ cachedBalance: 1000 });
      const tx = await created(acc.id, { amount: 100 });

      await expect(service.updateTransaction(tx.id, { accountId: MISSING })).rejects.toBeInstanceOf(NotFoundException);

      expect(await balanceOf(acc.id)).toBe('900.00');
    });

    it('throws NotFound for an unknown transaction', async () => {
      await expect(service.updateTransaction(MISSING, { note: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getSummary', () => {
    it('totals income, expense and net per currency', async () => {
      const vnd = await account();
      const usd = await account({ currency: 'USD' });
      await seedTx(vnd.id, { type: INCOME, amount: 500.25 });
      await seedTx(vnd.id, { type: EXPENSE, amount: 100.1 });
      await seedTx(vnd.id, { type: EXPENSE, amount: 50.05 });
      await seedTx(usd.id, { type: INCOME, amount: 20 });

      const { totals } = await service.getSummary({});

      const byCurrency = Object.fromEntries(totals.map((t) => [t.currency, t]));
      expect(totals).toHaveLength(2);
      expect(byCurrency.VND.income.toFixed(2)).toBe('500.25');
      expect(byCurrency.VND.expense.toFixed(2)).toBe('150.15');
      expect(byCurrency.VND.net.toFixed(2)).toBe('350.10');
      expect(byCurrency.USD.income.toFixed(2)).toBe('20.00');
      expect(byCurrency.USD.expense.toFixed(2)).toBe('0.00');
      expect(byCurrency.USD.net.toFixed(2)).toBe('20.00');
    });

    it('merges several accounts of the same currency', async () => {
      const a = await account();
      const b = await account();
      await seedTx(a.id, { type: INCOME, amount: 10 });
      await seedTx(b.id, { type: INCOME, amount: 5.5 });

      const { totals } = await service.getSummary({});

      expect(totals).toHaveLength(1);
      expect(totals[0].income.toFixed(2)).toBe('15.50');
    });

    it('filters by inclusive date range', async () => {
      const acc = await account();
      await seedTx(acc.id, { amount: 1, transactionTime: at('2030-01-01T23:59:59Z') });
      await seedTx(acc.id, { amount: 2, transactionTime: at('2030-01-02T00:00:00Z') });
      await seedTx(acc.id, { amount: 4, transactionTime: at('2030-01-03T00:00:00Z') });
      await seedTx(acc.id, { amount: 8, transactionTime: at('2030-01-03T00:00:01Z') });

      const { totals } = await service.getSummary({
        startDate: at('2030-01-02T00:00:00Z'),
        endDate: at('2030-01-03T00:00:00Z'),
      });

      expect(totals[0].expense.toFixed(2)).toBe('6.00');
    });

    it('filters by account', async () => {
      const a = await account();
      const b = await account();
      await seedTx(a.id, { amount: 3 });
      await seedTx(b.id, { amount: 7 });

      const { totals } = await service.getSummary({ accountId: b.id });

      expect(totals).toHaveLength(1);
      expect(totals[0].expense.toFixed(2)).toBe('7.00');
    });

    it('returns no totals when there are no transactions', async () => {
      expect(await service.getSummary({})).toEqual({ totals: [] });
    });
  });

  describe('deleteTransaction', () => {
    it('removes an EXPENSE and gives the amount back to the balance', async () => {
      const acc = await account({ cachedBalance: 1000 });
      const tx = await service.createTransaction(txDto(acc.id, { amount: 100.25 }));
      expect(await balanceOf(acc.id)).toBe('899.75');

      expect(await service.deleteTransaction(tx.id)).toEqual({ success: true });

      expect(await ctx.prisma.transaction.findUnique({ where: { id: tx.id } })).toBeNull();
      expect(await balanceOf(acc.id)).toBe('1000.00');
    });

    it('removes an INCOME and takes the amount off the balance', async () => {
      const acc = await account({ cachedBalance: 1000 });
      const tx = await service.createTransaction(txDto(acc.id, { amount: 40, type: INCOME }));

      await service.deleteTransaction(tx.id);

      expect(await balanceOf(acc.id)).toBe('1000.00');
      expect(await txCount()).toBe(0);
    });

    it('throws NotFound for an unknown id', async () => {
      await expect(service.deleteTransaction(MISSING)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ---------------------------------------------------------------- AI tools

  describe('aiGetFinancialSummary', () => {
    it('returns per-currency totals and the active accounts only', async () => {
      const active = await account({ cachedBalance: 250.5 });
      await account({ cachedBalance: 99, isActive: false });

      const result = await service.aiGetFinancialSummary();

      expect(result.summary.totals).toHaveLength(1);
      expect(result.summary.totals[0].totalBalance.toFixed(2)).toBe('250.50');
      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0]).toMatchObject({ id: active.id, accountName: 'Main', currency: 'VND' });
      expect(result.accounts[0].cachedBalance.toFixed(2)).toBe('250.50');
    });

    it('returns empty results without accounts', async () => {
      expect(await service.aiGetFinancialSummary()).toEqual({ summary: { totals: [] }, accounts: [] });
    });
  });

  describe('aiCreateTransaction', () => {
    it('creates the transaction with the given time and updates the balance', async () => {
      const acc = await account({ cachedBalance: 1000 });

      await service.aiCreateTransaction({
        accountId: acc.id,
        amount: 25,
        type: EXPENSE,
        transactionTime: at('2030-02-02T00:00:00Z'),
      });

      expect(await balanceOf(acc.id)).toBe('975.00');
      const [row] = await ctx.prisma.transaction.findMany({ where: { accountId: acc.id } });
      expect(row.transactionTime).toEqual(at('2030-02-02T00:00:00Z'));
    });

    it('defaults the time to now when omitted', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(at('2031-03-03T10:00:00Z'));
      try {
        const acc = await account();

        await service.aiCreateTransaction({ accountId: acc.id, amount: 5, type: INCOME });

        const [row] = await ctx.prisma.transaction.findMany({ where: { accountId: acc.id } });
        expect(row.transactionTime).toEqual(at('2031-03-03T10:00:00Z'));
        expect(await balanceOf(acc.id)).toBe('1005.00');
      } finally {
        vi.useRealTimers();
      }
    });

    it('rejects an inactive account', async () => {
      const acc = await account({ isActive: false });

      await expect(service.aiCreateTransaction({ accountId: acc.id, amount: 5, type: INCOME })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(await txCount()).toBe(0);
    });
  });

  describe('aiSearchTransactions', () => {
    it('returns the filtered page like getAllTransactions', async () => {
      const acc = await account();
      const income = await seedTx(acc.id, { type: INCOME });
      await seedTx(acc.id, { type: EXPENSE });

      const result = await service.aiSearchTransactions({ accountId: acc.id, type: INCOME });

      expect(result.total).toBe(1);
      expect(result.items.map((t) => t.id)).toEqual([income.id]);
    });
  });
});
