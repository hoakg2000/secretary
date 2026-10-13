import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmailMatcher, EmailRuleType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateEmailRuleDto {
  @ApiProperty({
    enum: EmailRuleType,
    example: EmailRuleType.moneylist,
    description: 'Loại quy tắc: blacklist | moneylist | whitelist',
  })
  @IsEnum(EmailRuleType)
  @IsNotEmpty()
  type: EmailRuleType;

  @ApiProperty({
    enum: EmailMatcher,
    example: EmailMatcher.sender,
    description: 'Tiêu chí khớp: sender | keyword | regex',
  })
  @IsEnum(EmailMatcher)
  @IsNotEmpty()
  matcher: EmailMatcher;

  @ApiProperty({
    example: 'no-reply@vietcombank.com.vn',
    description: 'Giá trị dùng để so khớp',
  })
  @IsString()
  @IsNotEmpty()
  matchValue: string;

  @ApiPropertyOptional({
    example: 'Lọc email thông báo biến động số dư Vietcombank',
    description: 'Mô tả chi tiết quy tắc',
  })
  @IsString()
  @IsOptional()
  description?: string;
}
