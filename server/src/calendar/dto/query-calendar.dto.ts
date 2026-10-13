import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';

export class QueryCalendarDto {
  @ApiPropertyOptional({
    description: 'Đầu khoảng lọc: lấy các sự kiện kết thúc từ thời điểm này trở đi',
    example: '2026-10-01T00:00:00.000Z',
  })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  fromDate?: Date;

  @ApiPropertyOptional({
    description: 'Cuối khoảng lọc: lấy các sự kiện bắt đầu trước thời điểm này',
    example: '2026-10-31T23:59:59.000Z',
  })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  toDate?: Date;
}
