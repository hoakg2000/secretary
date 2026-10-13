import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { FilterTransactionDto } from './dto/filter-transaction.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import { FinanceService } from './finance.service';

@ApiTags('Finance')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('api/v1/finance')
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

  @ApiOperation({ summary: 'Lấy danh sách tất cả tài khoản ngân hàng' })
  @ApiResponse({ status: 200, description: 'Lấy danh sách thành công' })
  @Get('accounts')
  @HttpCode(HttpStatus.OK)
  async getAllBankAccounts() {
    const data = await this.financeService.getAllBankAccounts();
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

  @ApiOperation({ summary: 'Xóa tài khoản ngân hàng' })
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
  @Get('categories')
  @HttpCode(HttpStatus.OK)
  async getAllCategories() {
    const data = await this.financeService.getAllCategories();
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách danh mục thành công',
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

  @ApiOperation({ summary: 'Lọc và lấy danh sách giao dịch tài chính' })
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
