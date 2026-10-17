import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsUUID } from 'class-validator';

export class SummaryQueryDto {
  @ApiPropertyOptional({
    example: '2026-10-01T00:00:00.000Z',
    description: 'Từ ngày (bao gồm)',
  })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  startDate?: Date;

  @ApiPropertyOptional({
    example: '2026-10-31T23:59:59.999Z',
    description: 'Đến ngày (bao gồm)',
  })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  endDate?: Date;

  @ApiPropertyOptional({ description: 'Chỉ tính một tài khoản ngân hàng' })
  @IsUUID()
  @IsOptional()
  accountId?: string;
}
