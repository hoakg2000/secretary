import { ApiPropertyOptional } from '@nestjs/swagger';
import { EmailStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ListEmailLogDto extends PaginationDto(50) {
  @ApiPropertyOptional({
    enum: EmailStatus,
    description: 'Lọc theo trạng thái',
  })
  @IsEnum(EmailStatus)
  @IsOptional()
  status?: EmailStatus;
}
