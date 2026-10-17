import { ApiPropertyOptional } from '@nestjs/swagger';
import { EmailStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListEmailLogDto {
  @ApiPropertyOptional({ enum: EmailStatus, description: 'Lọc theo trạng thái' })
  @IsEnum(EmailStatus)
  @IsOptional()
  status?: EmailStatus;

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
