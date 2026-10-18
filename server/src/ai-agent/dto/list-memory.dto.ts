import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ListMemoryDto extends PaginationDto(50) {
  @ApiPropertyOptional({ description: 'Lọc theo category' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ description: 'Lọc theo nguồn (CHAT, EMAIL, MANUAL)' })
  @IsString()
  @IsOptional()
  source?: string;
}
