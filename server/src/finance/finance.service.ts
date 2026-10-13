import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';

import { AiTool } from '../common/decorators/ai-tool.decorator';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { FilterTransactionDto } from './dto/filter-transaction.dto';

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

  async getAllBankAccounts() {
    return this.prisma.bankAccount.findMany({
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

  async deleteBankAccount(id: string) {
    await this.getBankAccountById(id);

    await this.prisma.bankAccount.delete({
      where: { id },
    });

    return { success: true };
  }

  async getTotalBalance() {
    const accounts = await this.prisma.bankAccount.findMany({
      where: { isActive: true },
      select: { cachedBalance: true, currency: true },
    });

    const totalVnd = accounts.reduce((sum, acc) => {
      return sum + Number(acc.cachedBalance);
    }, 0);

    return {
      totalAccounts: accounts.length,
      totalBalance: totalVnd,
      currency: 'VND',
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

  async getAllCategories() {
    return this.prisma.category.findMany({
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
    // 1. Kiểm tra sự tồn tại của tài khoản ngân hàng
    const account = await this.prisma.bankAccount.findUnique({
      where: { id: dto.accountId },
    });

    if (!account) {
      throw new NotFoundException(
        `Không tìm thấy tài khoản ngân hàng với ID: ${dto.accountId}`,
      );
    }

    // 2. Nếu có categoryId, kiểm tra category
    if (dto.categoryId) {
      await this.getCategoryById(dto.categoryId);
    }

    // 3. Tính toán số dư mới
    const currentBalance = Number(account.cachedBalance);
    const amount = Number(dto.amount);
    const newBalance =
      dto.type === 'INCOME' ? currentBalance + amount : currentBalance - amount;

    // 4. Sử dụng Transaction Database để đảm bảo tính toàn vẹn dữ liệu
    return this.prisma.$transaction(async (tx) => {
      // Tạo giao dịch mới
      const transaction = await tx.transaction.create({
        data: {
          accountId: dto.accountId,
          categoryId: dto.categoryId,
          amount: dto.amount,
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

      // Tự động cập nhật cachedBalance của BankAccount
      await tx.bankAccount.update({
        where: { id: dto.accountId },
        data: { cachedBalance: newBalance },
      });

      return transaction;
    });
  }

  async getAllTransactions(filterDto: FilterTransactionDto) {
    const { accountId, categoryId, type, startDate, endDate } = filterDto;

    const whereCondition: any = {};

    if (accountId) whereCondition.accountId = accountId;
    if (categoryId) whereCondition.categoryId = categoryId;
    if (type) whereCondition.type = type;

    if (startDate || endDate) {
      whereCondition.transactionTime = {};
      if (startDate) whereCondition.transactionTime.gte = startDate;
      if (endDate) whereCondition.transactionTime.lte = endDate;
    }

    return this.prisma.transaction.findMany({
      where: whereCondition,
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
    });
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

  async deleteTransaction(id: string) {
    const transaction = await this.getTransactionById(id);

    const account = await this.prisma.bankAccount.findUnique({
      where: { id: transaction.accountId },
    });

    if (account) {
      const currentBalance = Number(account.cachedBalance);
      const amount = Number(transaction.amount);

      // Đảo ngược lại biến động khi xóa giao dịch
      const revertedBalance =
        transaction.type === 'INCOME'
          ? currentBalance - amount
          : currentBalance + amount;

      await this.prisma.$transaction(async (tx) => {
        await tx.transaction.delete({ where: { id } });
        await tx.bankAccount.update({
          where: { id: transaction.accountId },
          data: { cachedBalance: revertedBalance },
        });
      });
    } else {
      await this.prisma.transaction.delete({ where: { id } });
    }

    return { success: true };
  }

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
  async aiCreateTransaction(params: {
    accountId: string;
    amount: number;
    type: 'INCOME' | 'EXPENSE';
    categoryId?: string;
    counterparty?: string;
    note?: string;
    transactionTime?: string;
  }) {
    const transactionTime = params.transactionTime
      ? new Date(params.transactionTime)
      : new Date();

    return this.createTransaction({
      accountId: params.accountId,
      amount: params.amount,
      type: params.type,
      categoryId: params.categoryId,
      counterparty: params.counterparty,
      note: params.note,
      transactionTime,
    });
  }

  @AiTool({
    name: 'search_financial_transactions',
    description:
      'Tra cứu danh sách lịch sử giao dịch tài chính theo khoảng thời gian hoặc loại giao dịch.',
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
  async aiSearchTransactions(params: {
    accountId?: string;
    type?: 'INCOME' | 'EXPENSE';
    startDate?: string;
    endDate?: string;
  }) {
    return this.getAllTransactions({
      accountId: params.accountId,
      type: params.type,
      startDate: params.startDate ? new Date(params.startDate) : undefined,
      endDate: params.endDate ? new Date(params.endDate) : undefined,
    });
  }
}
