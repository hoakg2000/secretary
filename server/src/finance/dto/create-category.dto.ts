import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Ăn uống', description: 'Tên danh mục' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    enum: TransactionType,
    example: TransactionType.EXPENSE,
    description: 'Loại danh mục (INCOME / EXPENSE)',
  })
  @IsEnum(TransactionType)
  @IsNotEmpty()
  type: TransactionType;

  @ApiPropertyOptional({ example: 'utensils', description: 'Mã icon đại diện' })
  @IsString()
  @IsOptional()
  icon?: string;

  @ApiPropertyOptional({
    example: 3000000,
    description: 'Hạn mức ngân sách tháng',
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  budgetLimit?: number;
}
