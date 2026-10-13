import { ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class FilterTransactionDto {
  @ApiPropertyOptional({ description: 'Lọc theo ID tài khoản ngân hàng' })
  @IsUUID()
  @IsOptional()
  accountId?: string;

  @ApiPropertyOptional({ description: 'Lọc theo ID danh mục' })
  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({
    enum: TransactionType,
    description: 'Lọc theo INCOME hoặc EXPENSE',
  })
  @IsEnum(TransactionType)
  @IsOptional()
  type?: TransactionType;

  @ApiPropertyOptional({
    example: '2026-10-01T00:00:00.000Z',
    description: 'Từ ngày',
  })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  startDate?: Date;

  @ApiPropertyOptional({
    example: '2026-10-31T23:59:59.999Z',
    description: 'Đến ngày',
  })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  endDate?: Date;

  @ApiPropertyOptional({ description: 'Trang (bắt đầu từ 1)', default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({
    description: 'Số giao dịch mỗi trang (tối đa 100)',
    default: 20,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize?: number;
}
