import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateBankAccountDto {
  @ApiProperty({
    example: 'Tài khoản MB Bank',
    description: 'Tên gợi nhớ tài khoản',
  })
  @IsString()
  @IsNotEmpty()
  accountName: string;

  @ApiProperty({
    example: 'MBBank',
    description: 'Mã ngân hàng / Tên định danh',
  })
  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @ApiProperty({ example: '0987654321', description: 'Số tài khoản' })
  @IsString()
  @IsNotEmpty()
  accountNumber: string;

  @ApiPropertyOptional({
    example: 5000000,
    description: 'Số dư ban đầu',
    default: 0,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  cachedBalance?: number;

  @ApiPropertyOptional({ example: 'VND', default: 'VND' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
