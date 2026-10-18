import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateSessionDto {
  @ApiProperty({ description: 'ID nhân vật AI của phiên chat' })
  @IsUUID()
  characterId: string;

  @ApiPropertyOptional({
    description:
      'Tiêu đề phiên (1-120 ký tự). Bỏ trống thì lấy từ tin nhắn đầu tiên',
    maxLength: 120,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @IsOptional()
  title?: string;
}
