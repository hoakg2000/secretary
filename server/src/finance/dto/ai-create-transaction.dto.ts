import { OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';
import { CreateTransactionDto } from './create-transaction.dto';

// Cùng quy tắc với CreateTransactionDto; AI không được gắn emailLogId và có thể bỏ trống thời gian
export class AiCreateTransactionDto extends OmitType(CreateTransactionDto, [
  'transactionTime',
  'emailLogId',
] as const) {
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  transactionTime?: Date;
}
