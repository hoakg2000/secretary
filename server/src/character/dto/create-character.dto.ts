import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
    example: false,
    default: false,
    description: 'Trạng thái kích hoạt',
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
