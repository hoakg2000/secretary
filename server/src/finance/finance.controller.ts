import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TransactionType } from '@prisma/client';
import { AdjustBalanceDto } from './dto/adjust-balance.dto';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { FilterTransactionDto } from './dto/filter-transaction.dto';
import { SummaryQueryDto } from './dto/summary-query.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { FinanceService } from './finance.service';

@ApiTags('Finance')
@ApiBearerAuth('JWT-auth')
@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  // ==========================================
  // BANK ACCOUNTS ENDPOINTS
  // ==========================================

  @ApiOperation({ summary: 'Tạo tài khoản ngân hàng mới' })
  @ApiResponse({ status: 201, description: 'Tạo tài khoản thành công' })
  @Post('accounts')
  @HttpCode(HttpStatus.CREATED)
  async createBankAccount(@Body() dto: CreateBankAccountDto) {
    const data = await this.financeService.createBankAccount(dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Tạo tài khoản ngân hàng thành công',
      data,
    };
  }

  @ApiOperation({
    summary:
      'Lấy danh sách tài khoản ngân hàng (mặc định chỉ tài khoản đang hoạt động)',
  })
  @ApiQuery({ name: 'includeInactive', type: Boolean, required: false })
  @ApiResponse({ status: 200, description: 'Lấy danh sách thành công' })
  @Get('accounts')
  @HttpCode(HttpStatus.OK)
  async getAllBankAccounts(
    @Query('includeInactive', new ParseBoolPipe({ optional: true }))
    includeInactive?: boolean,
  ) {
    const data = await this.financeService.getAllBankAccounts(includeInactive);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách tài khoản ngân hàng thành công',
      data,
    };
  }

  @ApiOperation({ summary: 'Xem tổng hợp số dư tất cả tài khoản' })
  @ApiResponse({ status: 200, description: 'Tính tổng số dư thành công' })
  @Get('accounts/total-balance')
  @HttpCode(HttpStatus.OK)
  async getTotalBalance() {
    const data = await this.financeService.getTotalBalance();
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy tổng số dư tài chính thành công',
      data,
    };
  }

  @ApiOperation({ summary: 'Lấy thông tin chi tiết một tài khoản ngân hàng' })
  @ApiResponse({ status: 200, description: 'Lấy thông tin thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy tài khoản' })
  @Get('accounts/:id')
  @HttpCode(HttpStatus.OK)
  async getBankAccountById(@Param('id') id: string) {
    const data = await this.financeService.getBankAccountById(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy chi tiết tài khoản ngân hàng thành công',
      data,
    };
  }

  @ApiOperation({ summary: 'Cập nhật thông tin tài khoản ngân hàng' })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công' })
  @Patch('accounts/:id')
  @HttpCode(HttpStatus.OK)
  async updateBankAccount(
    @Param('id') id: string,
    @Body() dto: UpdateBankAccountDto,
  ) {
    const data = await this.financeService.updateBankAccount(id, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Cập nhật tài khoản ngân hàng thành công',
      data,
    };
  }

  @ApiOperation({
    summary:
      'Điều chỉnh số dư thủ công (ghi chênh lệch thành một giao dịch điều chỉnh)',
  })
  @ApiResponse({ status: 200, description: 'Điều chỉnh số dư thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy tài khoản' })
  @Patch('accounts/:id/balance')
  @HttpCode(HttpStatus.OK)
  async adjustBalance(@Param('id') id: string, @Body() dto: AdjustBalanceDto) {
    const data = await this.financeService.adjustBalance(id, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Điều chỉnh số dư thành công',
      data,
    };
  }

  @ApiOperation({
    summary:
      'Xóa tài khoản ngân hàng (đã có giao dịch thì chỉ chuyển sang ngừng hoạt động)',
  })
  @ApiResponse({ status: 200, description: 'Xóa tài khoản thành công' })
  @Delete('accounts/:id')
  @HttpCode(HttpStatus.OK)
  async deleteBankAccount(@Param('id') id: string) {
    const data = await this.financeService.deleteBankAccount(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Xóa tài khoản ngân hàng thành công',
      data,
    };
  }

  // ==========================================
  // CATEGORIES ENDPOINTS
  // ==========================================

  @ApiOperation({ summary: 'Tạo danh mục thu/chi mới' })
  @ApiResponse({ status: 201, description: 'Tạo danh mục thành công' })
  @Post('categories')
  @HttpCode(HttpStatus.CREATED)
  async createCategory(@Body() dto: CreateCategoryDto) {
    const data = await this.financeService.createCategory(dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Tạo danh mục thành công',
      data,
    };
  }

  @ApiOperation({ summary: 'Lấy danh sách danh mục thu/chi' })
  @ApiResponse({ status: 200, description: 'Lấy danh sách thành công' })
  @ApiQuery({ name: 'type', enum: TransactionType, required: false })
  @Get('categories')
  @HttpCode(HttpStatus.OK)
  async getAllCategories(
    @Query('type', new ParseEnumPipe(TransactionType, { optional: true }))
    type?: TransactionType,
  ) {
    const data = await this.financeService.getAllCategories(type);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách danh mục thành công',
      data,
    };
  }

  @ApiOperation({ summary: 'Cập nhật danh mục thu/chi (không đổi loại)' })
  @ApiResponse({ status: 200, description: 'Cập nhật danh mục thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy danh mục' })
  @Patch('categories/:id')
  @HttpCode(HttpStatus.OK)
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    const data = await this.financeService.updateCategory(id, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Cập nhật danh mục thành công',
      data,
    };
  }

  @ApiOperation({ summary: 'Xóa danh mục thu/chi' })
  @ApiResponse({ status: 200, description: 'Xóa danh mục thành công' })
  @Delete('categories/:id')
  @HttpCode(HttpStatus.OK)
  async deleteCategory(@Param('id') id: string) {
    const data = await this.financeService.deleteCategory(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Xóa danh mục thành công',
      data,
    };
  }

  // ==========================================
  // TRANSACTIONS ENDPOINTS
  // ==========================================

  @ApiOperation({
    summary: 'Tạo giao dịch tài chính mới (tự động cập nhật số dư tài khoản)',
  })
  @ApiResponse({ status: 201, description: 'Tạo giao dịch thành công' })
  @Post('transactions')
  @HttpCode(HttpStatus.CREATED)
  async createTransaction(@Body() dto: CreateTransactionDto) {
    const data = await this.financeService.createTransaction(dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Tạo giao dịch tài chính thành công',
      data,
    };
  }

  @ApiOperation({
    summary: 'Lọc và lấy danh sách giao dịch tài chính (phân trang)',
  })
  @ApiResponse({ status: 200, description: 'Lấy danh sách thành công' })
  @Post('transactions/search')
  @HttpCode(HttpStatus.OK)
  async getAllTransactions(@Body() filterDto: FilterTransactionDto) {
    const data = await this.financeService.getAllTransactions(filterDto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách giao dịch thành công',
      data,
    };
  }

  @ApiOperation({
    summary:
      'Tổng thu/chi theo từng loại tiền tệ (lọc theo thời gian, tài khoản)',
  })
  @ApiResponse({ status: 200, description: 'Lấy tổng hợp thành công' })
  @Get('summary')
  @HttpCode(HttpStatus.OK)
  async getSummary(@Query() query: SummaryQueryDto) {
    const data = await this.financeService.getSummary(query);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy tổng hợp thu chi thành công',
      data,
    };
  }

  @ApiOperation({ summary: 'Xem chi tiết giao dịch tài chính' })
  @ApiResponse({ status: 200, description: 'Lấy chi tiết thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy giao dịch' })
  @Get('transactions/:id')
  @HttpCode(HttpStatus.OK)
  async getTransactionById(@Param('id') id: string) {
    const data = await this.financeService.getTransactionById(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy chi tiết giao dịch thành công',
      data,
    };
  }

  @ApiOperation({
    summary: 'Sửa giao dịch tài chính (tự điều chỉnh lại số dư tài khoản)',
  })
  @ApiResponse({ status: 200, description: 'Cập nhật giao dịch thành công' })
  @ApiResponse({
    status: 400,
    description: 'Tài khoản ngừng hoạt động hoặc danh mục sai loại',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy giao dịch, tài khoản hoặc danh mục',
  })
  @Patch('transactions/:id')
  @HttpCode(HttpStatus.OK)
  async updateTransaction(
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    const data = await this.financeService.updateTransaction(id, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Cập nhật giao dịch thành công',
      data,
    };
  }

  @ApiOperation({
    summary: 'Xóa giao dịch tài chính (hoàn tác biến động số dư)',
  })
  @ApiResponse({ status: 200, description: 'Xóa giao dịch thành công' })
  @Delete('transactions/:id')
  @HttpCode(HttpStatus.OK)
  async deleteTransaction(@Param('id') id: string) {
    const data = await this.financeService.deleteTransaction(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Xóa giao dịch thành công',
      data,
    };
  }
}
