import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class SearchMemoryDto {
  @ApiProperty({ description: 'Truy vấn tìm kiếm ký ức' })
  @IsString()
  @IsNotEmpty()
  query: string;

  @ApiPropertyOptional({ description: 'Lọc theo category' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ description: 'Lọc theo nguồn (CHAT, EMAIL, MANUAL)' })
  @IsString()
  @IsOptional()
  source?: string;

  @ApiPropertyOptional({
    description: 'Số lượng ký ức tối đa trả về (1-20)',
    default: 5,
  })
  @IsInt()
  @Min(1)
  @Max(20)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Ngưỡng cosine similarity tối thiểu (0-1). Ký ức dưới ngưỡng không được trả về',
    default: 0.5,
  })
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  minScore?: number;
}
