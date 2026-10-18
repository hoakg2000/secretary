import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsString, ValidateIf } from 'class-validator';
import { CreateBankAccountDto } from './create-bank-account.dto';

// Số dư không sửa qua đây: dùng PATCH /finance/accounts/:id/balance để có bút toán điều chỉnh.
// skipNullProperties: false -> null trên accountName/bankCode/accountNumber bị chặn (400).
// currency/isActive là @IsOptional ở Create nhưng cột không nullable, nên khai báo lại để null cũng bị chặn
export class UpdateBankAccountDto extends PartialType(
  OmitType(CreateBankAccountDto, [
    'cachedBalance',
    'currency',
    'isActive',
  ] as const),
  { skipNullProperties: false },
) {
  @ApiPropertyOptional({ example: 'VND' })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: true })
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
