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
import { ResponseMessage } from '../common/decorators/response-message.decorator';
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
  @ResponseMessage('Tạo tài khoản ngân hàng thành công')
  createBankAccount(@Body() dto: CreateBankAccountDto) {
    return this.financeService.createBankAccount(dto);
  }

  @ApiOperation({
    summary:
      'Lấy danh sách tài khoản ngân hàng (mặc định chỉ tài khoản đang hoạt động)',
  })
  @ApiQuery({ name: 'includeInactive', type: Boolean, required: false })
  @ApiResponse({ status: 200, description: 'Lấy danh sách thành công' })
  @Get('accounts')
  @ResponseMessage('Lấy danh sách tài khoản ngân hàng thành công')
  getAllBankAccounts(
    @Query('includeInactive', new ParseBoolPipe({ optional: true }))
    includeInactive?: boolean,
  ) {
    return this.financeService.getAllBankAccounts(includeInactive);
  }

  @ApiOperation({ summary: 'Xem tổng hợp số dư tất cả tài khoản' })
  @ApiResponse({ status: 200, description: 'Tính tổng số dư thành công' })
  @Get('accounts/total-balance')
  @ResponseMessage('Lấy tổng số dư tài chính thành công')
  getTotalBalance() {
    return this.financeService.getTotalBalance();
  }

  @ApiOperation({ summary: 'Lấy thông tin chi tiết một tài khoản ngân hàng' })
  @ApiResponse({ status: 200, description: 'Lấy thông tin thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy tài khoản' })
  @Get('accounts/:id')
  @ResponseMessage('Lấy chi tiết tài khoản ngân hàng thành công')
  getBankAccountById(@Param('id') id: string) {
    return this.financeService.getBankAccountById(id);
  }

  @ApiOperation({ summary: 'Cập nhật thông tin tài khoản ngân hàng' })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy tài khoản' })
  @Patch('accounts/:id')
  @ResponseMessage('Cập nhật tài khoản ngân hàng thành công')
  updateBankAccount(
    @Param('id') id: string,
    @Body() dto: UpdateBankAccountDto,
  ) {
    return this.financeService.updateBankAccount(id, dto);
  }

  @ApiOperation({
    summary:
      'Điều chỉnh số dư thủ công (ghi chênh lệch thành một giao dịch điều chỉnh)',
  })
  @ApiResponse({ status: 200, description: 'Điều chỉnh số dư thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy tài khoản' })
  @Patch('accounts/:id/balance')
  @ResponseMessage('Điều chỉnh số dư thành công')
  adjustBalance(@Param('id') id: string, @Body() dto: AdjustBalanceDto) {
    return this.financeService.adjustBalance(id, dto);
  }

  @ApiOperation({
    summary:
      'Xóa tài khoản ngân hàng (đã có giao dịch thì chỉ chuyển sang ngừng hoạt động)',
  })
  @ApiResponse({
    status: 200,
    description: 'Xóa hoặc vô hiệu hóa tài khoản thành công',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy tài khoản' })
  @Delete('accounts/:id')
  @ResponseMessage('Xóa hoặc vô hiệu hóa tài khoản thành công')
  async deleteBankAccount(@Param('id') id: string) {
    await this.financeService.deleteBankAccount(id);
  }

  // ==========================================
  // CATEGORIES ENDPOINTS
  // ==========================================

  @ApiOperation({ summary: 'Tạo danh mục thu/chi mới' })
  @ApiResponse({ status: 201, description: 'Tạo danh mục thành công' })
  @Post('categories')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Tạo danh mục thành công')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.financeService.createCategory(dto);
  }

  @ApiOperation({ summary: 'Lấy danh sách danh mục thu/chi' })
  @ApiResponse({ status: 200, description: 'Lấy danh sách thành công' })
  @ApiQuery({ name: 'type', enum: TransactionType, required: false })
  @Get('categories')
  @ResponseMessage('Lấy danh sách danh mục thành công')
  getAllCategories(
    @Query('type', new ParseEnumPipe(TransactionType, { optional: true }))
    type?: TransactionType,
  ) {
    return this.financeService.getAllCategories(type);
  }

  @ApiOperation({ summary: 'Cập nhật danh mục thu/chi (không đổi loại)' })
  @ApiResponse({ status: 200, description: 'Cập nhật danh mục thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy danh mục' })
  @Patch('categories/:id')
  @ResponseMessage('Cập nhật danh mục thành công')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.financeService.updateCategory(id, dto);
  }

  @ApiOperation({ summary: 'Xóa danh mục thu/chi' })
  @ApiResponse({ status: 200, description: 'Xóa danh mục thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy danh mục' })
  @Delete('categories/:id')
  @ResponseMessage('Xóa danh mục thành công')
  async deleteCategory(@Param('id') id: string) {
    await this.financeService.deleteCategory(id);
  }

  // ==========================================
  // TRANSACTIONS ENDPOINTS
  // ==========================================

  @ApiOperation({
    summary: 'Tạo giao dịch tài chính mới (tự động cập nhật số dư tài khoản)',
  })
  @ApiResponse({ status: 201, description: 'Tạo giao dịch thành công' })
  @ApiResponse({
    status: 400,
    description: 'Tài khoản ngừng hoạt động hoặc danh mục sai loại',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy tài khoản hoặc danh mục',
  })
  @Post('transactions')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Tạo giao dịch tài chính thành công')
  createTransaction(@Body() dto: CreateTransactionDto) {
    return this.financeService.createTransaction(dto);
  }

  @ApiOperation({
    summary: 'Lọc và lấy danh sách giao dịch tài chính (phân trang)',
  })
  @ApiResponse({ status: 200, description: 'Lấy danh sách thành công' })
  @Post('transactions/search')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Lấy danh sách giao dịch thành công')
  getAllTransactions(@Body() filterDto: FilterTransactionDto) {
    return this.financeService.getAllTransactions(filterDto);
  }

  @ApiOperation({
    summary:
      'Tổng thu/chi theo từng loại tiền tệ (lọc theo thời gian, tài khoản)',
  })
  @ApiResponse({ status: 200, description: 'Lấy tổng hợp thành công' })
  @Get('summary')
  @ResponseMessage('Lấy tổng hợp thu chi thành công')
  getSummary(@Query() query: SummaryQueryDto) {
    return this.financeService.getSummary(query);
  }

  @ApiOperation({ summary: 'Xem chi tiết giao dịch tài chính' })
  @ApiResponse({ status: 200, description: 'Lấy chi tiết thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy giao dịch' })
  @Get('transactions/:id')
  @ResponseMessage('Lấy chi tiết giao dịch thành công')
  getTransactionById(@Param('id') id: string) {
    return this.financeService.getTransactionById(id);
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
  @ResponseMessage('Cập nhật giao dịch thành công')
  updateTransaction(
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this.financeService.updateTransaction(id, dto);
  }

  @ApiOperation({
    summary: 'Xóa giao dịch tài chính (hoàn tác biến động số dư)',
  })
  @ApiResponse({ status: 200, description: 'Xóa giao dịch thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy giao dịch' })
  @Delete('transactions/:id')
  @ResponseMessage('Xóa giao dịch thành công')
  async deleteTransaction(@Param('id') id: string) {
    await this.financeService.deleteTransaction(id);
  }
}
