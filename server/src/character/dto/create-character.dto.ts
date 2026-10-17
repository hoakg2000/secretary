import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCharacterDto {
  @ApiProperty({ example: 'Mari', description: 'Tên nhân vật AI' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'voice_01', description: 'ID giọng nói TTS' })
  @IsString()
  @IsOptional()
  voiceId?: string;

  @ApiPropertyOptional({
    example: 'Blue Archive',
    description: 'Nguồn gốc nhân vật',
  })
  @IsString()
  @IsOptional()
  source?: string;

  @ApiPropertyOptional({
    description:
      'Quy tắc AI dùng để chọn tin nhắn chat đáng lưu thành ký ức (bỏ trống = quy tắc mặc định)',
  })
  @IsString()
  @MaxLength(2000) // nằm trong system prompt của mọi lượt chat
  @IsOptional()
  memoryRule?: string;
}
