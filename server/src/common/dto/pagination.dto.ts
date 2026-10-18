import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { DEFAULT_PAGE_SIZE } from '../pagination';

/** Base DTO phân trang; mỗi danh sách chọn pageSize tối đa riêng: `extends PaginationDto(50)` */
export function PaginationDto(maxPageSize = 50) {
  class Pagination {
    @ApiPropertyOptional({ description: 'Trang (bắt đầu từ 1)', default: 1 })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @IsOptional()
    page?: number;

    @ApiPropertyOptional({
      description: `Số bản ghi mỗi trang (tối đa ${maxPageSize})`,
      default: DEFAULT_PAGE_SIZE,
    })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(maxPageSize)
    @IsOptional()
    pageSize?: number;
  }
  return Pagination;
}
