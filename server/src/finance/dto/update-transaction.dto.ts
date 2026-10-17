import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateTransactionDto } from './create-transaction.dto';

// Không gắn lại email log: liên kết này chỉ được đặt lúc tạo giao dịch
export class UpdateTransactionDto extends PartialType(
  OmitType(CreateTransactionDto, ['emailLogId'] as const),
) {}
