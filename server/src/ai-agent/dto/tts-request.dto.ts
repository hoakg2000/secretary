import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class TtsRequestDto {
  @ApiProperty({ description: 'Nội dung văn bản cần phát âm thanh' })
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiPropertyOptional({
    description:
      'ID mẫu giọng nói Fish.audio (nếu không truyền sẽ dùng default)',
  })
  @IsString()
  @IsOptional()
  voiceId?: string;
}
