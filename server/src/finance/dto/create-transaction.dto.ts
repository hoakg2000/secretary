import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateTransactionDto {
  @ApiProperty({
    example: 'uuid-of-bank-account',
    description: 'ID tài khoản ngân hàng',
  })
  @IsUUID()
  @IsNotEmpty()
  accountId: string;

  @ApiPropertyOptional({
    example: 'uuid-of-category',
    description: 'ID danh mục thu chi',
  })
  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @ApiProperty({ example: 50000, description: 'Số tiền giao dịch' })
  @IsNumber()
  @Min(0.01)
  @IsNotEmpty()
  amount: number;

  @ApiProperty({
    enum: TransactionType,
    example: TransactionType.EXPENSE,
    description: 'Loại giao dịch (INCOME / EXPENSE)',
  })
  @IsEnum(TransactionType)
  @IsNotEmpty()
  type: TransactionType;

  @ApiPropertyOptional({
    example: 'Quán cơm Grab',
    description: 'Đối tác / Bên liên quan',
  })
  @IsString()
  @IsOptional()
  counterparty?: string;

  @ApiPropertyOptional({
    example: 'Ăn trưa với đồng nghiệp',
    description: 'Ghi chú giao dịch',
  })
  @IsString()
  @IsOptional()
  note?: string;

  @ApiProperty({
    example: '2026-10-09T12:00:00.000Z',
    description: 'Thời gian giao dịch phát sinh',
  })
  @Type(() => Date)
  @IsDate()
  @IsNotEmpty()
  transactionTime: Date;

  @ApiPropertyOptional({
    example: 'uuid-of-email-log',
    description: 'ID Email log nếu biến động từ email',
  })
  @IsUUID()
  @IsOptional()
  emailLogId?: string;
}
