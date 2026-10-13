import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateBankAccountDto } from './create-bank-account.dto';

// Số dư không sửa qua đây: dùng PATCH /finance/accounts/:id/balance để có bút toán điều chỉnh
export class UpdateBankAccountDto extends PartialType(
  OmitType(CreateBankAccountDto, ['cachedBalance'] as const),
) {}
