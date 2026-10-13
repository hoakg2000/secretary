import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class SearchMemoryDto {
  @ApiProperty({ description: 'Truy vấn tìm kiếm ký ức' })
  @IsString()
  @IsNotEmpty()
  query: string;

  @ApiPropertyOptional({ description: 'Lọc theo category' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({
    description: 'Số lượng ký ức tối đa trả về',
    default: 5,
  })
  @IsNumber()
  @IsOptional()
  limit?: number;
}
