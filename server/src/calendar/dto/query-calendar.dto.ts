import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class QueryCalendarDto {
  @ApiPropertyOptional({
    description: 'Tháng cần xem (1-12). Bỏ trống = tháng hiện tại theo APP_TIMEZONE',
    minimum: 1,
    maximum: 12,
    example: 10,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  @IsOptional()
  month?: number;

  @ApiPropertyOptional({
    description: 'Năm cần xem (2000-2100). Bỏ trống = năm hiện tại theo APP_TIMEZONE',
    minimum: 2000,
    maximum: 2100,
    example: 2026,
  })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  @IsOptional()
  year?: number;
}
