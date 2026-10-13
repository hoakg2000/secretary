import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class SaveMemoryDto {
  @ApiProperty({ description: 'Nội dung ký ức cần lưu trữ' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({
    description: 'Phân loại ký ức (ví dụ: PREFERENCE, FACT, EVENT)',
  })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({
    description: 'Nguồn gốc tạo ký ức (CHAT, EMAIL, MANUAL)',
    default: 'MANUAL',
  })
  @IsString()
  @IsOptional()
  source?: string;

  @ApiPropertyOptional({ description: 'Điểm khởi tạo ban đầu', default: 1.0 })
  @IsNumber()
  @IsOptional()
  initialScore?: number;

  @ApiPropertyOptional({
    description: 'Hệ số suy giảm điểm theo thời gian (decay factor)',
    default: 0.01,
  })
  @IsNumber()
  @IsOptional()
  decayFactor?: number;
}
