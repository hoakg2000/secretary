import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListMemoryDto {
  @ApiPropertyOptional({ description: 'Lọc theo category' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ description: 'Lọc theo nguồn (CHAT, EMAIL, MANUAL)' })
  @IsString()
  @IsOptional()
  source?: string;

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20, description: 'Tối đa 50' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  pageSize?: number;
}
