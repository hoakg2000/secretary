import { ApiPropertyOptional } from '@nestjs/swagger';
import { EmailStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

/** Tham số của tool search_emails */
export class SearchEmailsDto {
  @ApiPropertyOptional({
    description: 'Từ khóa khớp (không phân biệt hoa thường) với người gửi, tiêu đề hoặc tóm tắt',
  })
  @IsString()
  @IsOptional()
  query?: string;

  @ApiPropertyOptional({ enum: EmailStatus, description: 'Lọc theo trạng thái xử lý' })
  @IsEnum(EmailStatus)
  @IsOptional()
  status?: EmailStatus;

  @ApiPropertyOptional({ default: 10, description: 'Số email tối đa (mặc định 10, trên 20 được cắt về 20)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;
}
