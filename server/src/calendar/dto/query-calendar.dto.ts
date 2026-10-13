import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';

export class QueryCalendarDto {
  @ApiPropertyOptional({
    description: 'Lọc các sự kiện bắt đầu từ thời điểm này',
    example: '2026-10-01T00:00:00.000Z',
  })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  fromDate?: Date;

  @ApiPropertyOptional({
    description: 'Lọc các sự kiện kết thúc trước thời điểm này',
    example: '2026-10-31T23:59:59.000Z',
  })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  toDate?: Date;
}
