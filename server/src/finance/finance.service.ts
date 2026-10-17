import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';
import { AiTool } from '../common/decorators/ai-tool.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustBalanceDto } from './dto/adjust-balance.dto';
import { AiCreateTransactionDto } from './dto/ai-create-transaction.dto';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { FilterTransactionDto } from './dto/filter-transaction.dto';
import { SummaryQueryDto } from './dto/summary-query.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // BANK ACCOUNT SERVICES
  // ==========================================

  async createBankAccount(dto: CreateBankAccountDto) {
    return this.prisma.bankAccount.create({
      data: {
        accountName: dto.accountName,
        bankCode: dto.bankCode,
        accountNumber: dto.accountNumber,
        cachedBalance: dto.cachedBalance ?? 0,
        currency: dto.currency ?? 'VND',
        isActive: dto.isActive ?? true,
      },
    });
  }

  async getAllBankAccounts(includeInactive = false) {
    return this.prisma.bankAccount.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getBankAccountById(id: string) {
    const account = await this.prisma.bankAccount.findUnique({
      where: { id },
      include: {
        transactions: {
          take: 10,
          orderBy: { transactionTime: 'desc' },
        },
      },
    });

    if (!account) {
      throw new NotFoundException(
        `Không tìm thấy tài khoản ngân hàng với ID: ${id}`,
      );
    }

    return account;
  }

  async updateBankAccount(id: string, dto: UpdateBankAccountDto) {
    await this.getBankAccountById(id);

    return this.prisma.bankAccount.update({
      where: { id },
      data: dto,
    });
  }

  /**
   * Tài khoản đã có giao dịch thì chỉ ngừng hoạt động (giữ lịch sử); chưa có giao dịch mới xóa hẳn.
   */
  async deleteBankAccount(id: string) {
    await this.getBankAccountById(id);

    const transactionCount = await this.prisma.transaction.count({
      where: { accountId: id },
    });

    if (transactionCount > 0) {
      return this.prisma.bankAccount.update({
        where: { id },
        data: { isActive: false },
      });
    }

    await this.prisma.bankAccount.delete({
      where: { id },
    });

    return { success: true };
  }

  /**
   * Đặt lại số dư theo thực tế: chênh lệch được ghi thành một giao dịch điều chỉnh.
   * shortcut: đọc số dư rồi ghi chênh lệch ở isolation mặc định; giao dịch chen giữa làm số dư cuối lệch newBalance.
   * Nâng khi có nhiều writer đồng thời -> SELECT ... FOR UPDATE trên dòng tài khoản.
   */
  async adjustBalance(id: string, dto: AdjustBalanceDto) {
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.bankAccount.findUnique({ where: { id } });
      if (!account) {
        throw new NotFoundException(
          `Không tìm thấy tài khoản ngân hàng với ID: ${id}`,
        );
      }

      const delta = new Prisma.Decimal(dto.newBalance).minus(
        account.cachedBalance,
      );
      if (delta.isZero()) {
        return account;
      }

      await tx.transaction.create({
        data: {
          accountId: id,
          amount: delta.abs(),
          type: delta.isPositive()
            ? TransactionType.INCOME
            : TransactionType.EXPENSE,
          note: dto.note ?? 'Manual balance adjustment',
          transactionTime: new Date(),
        },
      });

      return tx.bankAccount.update({
        where: { id },
        data: { cachedBalance: { increment: delta } },
      });
    });
  }

  /** Tổng số dư các tài khoản đang hoạt động, tách theo từng loại tiền */
  async getTotalBalance() {
    const groups = await this.prisma.bankAccount.groupBy({
      by: ['currency'],
      where: { isActive: true },
      _sum: { cachedBalance: true },
      _count: true,
    });

    return {
      totals: groups.map((group) => ({
        currency: group.currency,
        totalBalance: group._sum.cachedBalance ?? new Prisma.Decimal(0),
        totalAccounts: group._count,
      })),
    };
  }

  // ==========================================
  // CATEGORY SERVICES
  // ==========================================

  async createCategory(dto: CreateCategoryDto) {
    return this.prisma.category.create({
      data: dto,
    });
  }

  async getAllCategories(type?: TransactionType) {
    return this.prisma.category.findMany({
      where: type ? { type } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async getCategoryById(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException(`Không tìm thấy danh mục với ID: ${id}`);
    }

    return category;
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    await this.getCategoryById(id);

    // name null (IsOptional cho qua) coi như không đổi; icon/budgetLimit null = xóa (cột nullable)
    return this.prisma.category.update({
      where: { id },
      data: { ...dto, name: dto.name ?? undefined },
    });
  }

  async deleteCategory(id: string) {
    await this.getCategoryById(id);

    await this.prisma.category.delete({
      where: { id },
    });

    return { success: true };
  }

  // ==========================================
  // TRANSACTION SERVICES & AUTO-UPDATE BALANCE
  // ==========================================

  async createTransaction(dto: CreateTransactionDto) {
    // 1. Tài khoản phải tồn tại và đang hoạt động
    const account = await this.prisma.bankAccount.findUnique({
      where: { id: dto.accountId },
    });

    if (!account) {
      throw new NotFoundException(
        `Không tìm thấy tài khoản ngân hàng với ID: ${dto.accountId}`,
      );
    }
    if (!account.isActive) {
      throw new BadRequestException('Tài khoản ngân hàng đã ngừng hoạt động');
    }

    // 2. Danh mục (nếu có) phải cùng loại với giao dịch
    if (dto.categoryId) {
      const category = await this.getCategoryById(dto.categoryId);
      if (category.type !== dto.type) {
        throw new BadRequestException(
          `Danh mục loại ${category.type} không dùng được cho giao dịch ${dto.type}`,
        );
      }
    }

    // 3. Email log (nếu có) phải tồn tại
    if (dto.emailLogId) {
      const emailLog = await this.prisma.emailLog.findUnique({
        where: { id: dto.emailLogId },
        select: { id: true },
      });
      if (!emailLog) {
        throw new NotFoundException(
          `Không tìm thấy email log với ID: ${dto.emailLogId}`,
        );
      }
    }

    const amount = new Prisma.Decimal(dto.amount);

    // 4. Số dư cộng/trừ nguyên tử ngay trong DB (increment/decrement), không tính bằng JS
    return this.prisma.$transaction(async (tx) => {
      await tx.bankAccount.update({
        where: { id: dto.accountId },
        data: {
          cachedBalance:
            dto.type === TransactionType.INCOME
              ? { increment: amount }
              : { decrement: amount },
        },
      });

      return tx.transaction.create({
        data: {
          accountId: dto.accountId,
          categoryId: dto.categoryId,
          amount,
          type: dto.type,
          counterparty: dto.counterparty,
          note: dto.note,
          transactionTime: dto.transactionTime,
          emailLogId: dto.emailLogId,
        },
        include: {
          account: true,
          category: true,
        },
      });
    });
  }

  async getAllTransactions(filterDto: FilterTransactionDto) {
    const { accountId, categoryId, type, startDate, endDate } = filterDto;
    const page = filterDto.page ?? 1;
    const pageSize = filterDto.pageSize ?? 20;

    const where: Prisma.TransactionWhereInput = {};

    if (accountId) where.accountId = accountId;
    if (categoryId) where.categoryId = categoryId;
    if (type) where.type = type;

    if (startDate || endDate) {
      where.transactionTime = {
        ...(startDate && { gte: startDate }),
        ...(endDate && { lte: endDate }),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: {
          account: {
            select: {
              id: true,
              accountName: true,
              bankCode: true,
              accountNumber: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              icon: true,
              type: true,
            },
          },
        },
        orderBy: { transactionTime: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async getTransactionById(id: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: {
        account: true,
        category: true,
        emailLog: true,
      },
    });

    if (!transaction) {
      throw new NotFoundException(`Không tìm thấy giao dịch với ID: ${id}`);
    }

    return transaction;
  }

  /**
   * Sửa giao dịch: hoàn tác biến động cũ trên tài khoản cũ, áp biến động mới lên tài khoản mới, trong một transaction.
   * Dòng cũ được đọc trong transaction nên chênh lệch không tính từ dữ liệu cũ.
   * shortcut: đọc rồi ghi ở isolation mặc định; hai lần sửa đồng thời cùng một giao dịch có thể cùng hoàn tác số cũ.
   * Nâng khi có nhiều writer đồng thời -> SELECT ... FOR UPDATE trên dòng giao dịch.
   */
  async updateTransaction(id: string, dto: UpdateTransactionDto) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.transaction.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException(`Không tìm thấy giao dịch với ID: ${id}`);
      }

      // null (IsOptional cho qua) coi như không đổi; riêng categoryId null nghĩa là bỏ danh mục
      const accountId = dto.accountId ?? existing.accountId;
      const type = dto.type ?? existing.type;
      const amount =
        dto.amount != null ? new Prisma.Decimal(dto.amount) : existing.amount;
      const categoryId =
        dto.categoryId === undefined ? existing.categoryId : dto.categoryId;

      const account = await tx.bankAccount.findUnique({
        where: { id: accountId },
      });
      if (!account) {
        throw new NotFoundException(
          `Không tìm thấy tài khoản ngân hàng với ID: ${accountId}`,
        );
      }
      // Chỉ chặn khi chuyển sang tài khoản ngừng hoạt động; sửa giao dịch cũ trên tài khoản đã đóng vẫn được
      if (accountId !== existing.accountId && !account.isActive) {
        throw new BadRequestException('Tài khoản ngân hàng đã ngừng hoạt động');
      }

      if (categoryId) {
        const category = await tx.category.findUnique({
          where: { id: categoryId },
        });
        if (!category) {
          throw new NotFoundException(
            `Không tìm thấy danh mục với ID: ${categoryId}`,
          );
        }
        if (category.type !== type) {
          throw new BadRequestException(
            `Danh mục loại ${category.type} không dùng được cho giao dịch ${type}`,
          );
        }
      }

      await tx.bankAccount.update({
        where: { id: existing.accountId },
        data: {
          cachedBalance:
            existing.type === TransactionType.INCOME
              ? { decrement: existing.amount }
              : { increment: existing.amount },
        },
      });
      await tx.bankAccount.update({
        where: { id: accountId },
        data: {
          cachedBalance:
            type === TransactionType.INCOME
              ? { increment: amount }
              : { decrement: amount },
        },
      });

      return tx.transaction.update({
        where: { id },
        data: {
          accountId,
          categoryId,
          amount,
          type,
          counterparty: dto.counterparty,
          note: dto.note,
          transactionTime: dto.transactionTime ?? undefined,
        },
        include: { account: true, category: true },
      });
    });
  }

  /** Tổng thu/chi theo từng loại tiền tệ (Transaction không có currency nên lấy qua tài khoản). */
  async getSummary(dto: SummaryQueryDto) {
    const { accountId, startDate, endDate } = dto;
    const where: Prisma.TransactionWhereInput = {};
    if (accountId) where.accountId = accountId;
    if (startDate || endDate) {
      where.transactionTime = {
        ...(startDate && { gte: startDate }),
        ...(endDate && { lte: endDate }),
      };
    }

    const groups = await this.prisma.transaction.groupBy({
      by: ['accountId', 'type'],
      where,
      _sum: { amount: true },
    });
    const accounts = await this.prisma.bankAccount.findMany({
      where: { id: { in: [...new Set(groups.map((g) => g.accountId))] } },
      select: { id: true, currency: true },
    });
    const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]));

    const byCurrency = new Map<
      string,
      { income: Prisma.Decimal; expense: Prisma.Decimal }
    >();
    for (const group of groups) {
      const currency = currencyOf.get(group.accountId);
      if (!currency) continue;
      const entry = byCurrency.get(currency) ?? {
        income: new Prisma.Decimal(0),
        expense: new Prisma.Decimal(0),
      };
      const sum = group._sum.amount ?? new Prisma.Decimal(0);
      if (group.type === TransactionType.INCOME) {
        entry.income = entry.income.plus(sum);
      } else {
        entry.expense = entry.expense.plus(sum);
      }
      byCurrency.set(currency, entry);
    }

    return {
      totals: [...byCurrency].map(([currency, { income, expense }]) => ({
        currency,
        income,
        expense,
        net: income.minus(expense),
      })),
    };
  }

  async deleteTransaction(id: string) {
    const transaction = await this.getTransactionById(id);

    // Xóa và hoàn tác biến động số dư trong cùng một transaction
    await this.prisma.$transaction(async (tx) => {
      await tx.transaction.delete({ where: { id } });
      await tx.bankAccount.update({
        where: { id: transaction.accountId },
        data: {
          cachedBalance:
            transaction.type === TransactionType.INCOME
              ? { decrement: transaction.amount }
              : { increment: transaction.amount },
        },
      });
    });

    return { success: true };
  }

  // ==========================================
  // AI TOOLS
  // ==========================================

  @AiTool({
    name: 'get_financial_summary',
    description:
      'Lấy tổng hợp số dư tất cả tài khoản ngân hàng và tổng số dư tài chính hiện tại của người dùng.',
  })
  async aiGetFinancialSummary() {
    const summary = await this.getTotalBalance();
    const accounts = await this.prisma.bankAccount.findMany({
      where: { isActive: true },
      select: {
        id: true,
        accountName: true,
        bankCode: true,
        accountNumber: true,
        cachedBalance: true,
        currency: true,
      },
    });

    return {
      summary,
      accounts,
    };
  }

  @AiTool({
    name: 'create_financial_transaction',
    description:
      'Tạo một giao dịch thu hoặc chi mới cho người dùng và tự động cập nhật số dư tài khoản.',
    dto: AiCreateTransactionDto,
    requiresConfirmation: true,
    parameters: {
      accountId: {
        type: 'string',
        description: 'ID của tài khoản ngân hàng phát sinh giao dịch',
        required: true,
      },
      amount: {
        type: 'number',
        description: 'Số tiền giao dịch (phải lớn hơn 0)',
        required: true,
      },
      type: {
        type: 'string',
        description:
          'Loại giao dịch: INCOME (Thu nhập) hoặc EXPENSE (Chi tiêu)',
        enum: ['INCOME', 'EXPENSE'],
        required: true,
      },
      categoryId: {
        type: 'string',
        description: 'ID của danh mục thu/chi',
        required: false,
      },
      counterparty: {
        type: 'string',
        description: 'Tên đối tác hoặc cửa hàng/người chuyển tiền',
        required: false,
      },
      note: {
        type: 'string',
        description: 'Ghi chú nội dung giao dịch',
        required: false,
      },
      transactionTime: {
        type: 'string',
        description:
          'Thời gian phát sinh giao dịch định dạng ISO8601 (ví dụ: 2026-10-09T10:00:00Z)',
        required: false,
      },
    },
  })
  async aiCreateTransaction(dto: AiCreateTransactionDto) {
    return this.createTransaction({
      ...dto,
      transactionTime: dto.transactionTime ?? new Date(),
    });
  }

  @AiTool({
    name: 'search_financial_transactions',
    description:
      'Tra cứu danh sách lịch sử giao dịch tài chính theo khoảng thời gian hoặc loại giao dịch.',
    dto: FilterTransactionDto,
    parameters: {
      accountId: {
        type: 'string',
        description: 'ID tài khoản ngân hàng',
        required: false,
      },
      type: {
        type: 'string',
        description: 'INCOME hoặc EXPENSE',
        enum: ['INCOME', 'EXPENSE'],
        required: false,
      },
      startDate: {
        type: 'string',
        description: 'Thời gian bắt đầu (ISO8601)',
        required: false,
      },
      endDate: {
        type: 'string',
        description: 'Thời gian kết thúc (ISO8601)',
        required: false,
      },
    },
  })
  async aiSearchTransactions(dto: FilterTransactionDto) {
    return this.getAllTransactions(dto);
  }
}
