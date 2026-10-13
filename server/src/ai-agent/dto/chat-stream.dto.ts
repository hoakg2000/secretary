import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class ChatStreamDto {
  @ApiProperty({ description: 'Nội dung tin nhắn / prompt từ người dùng' })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({
    description:
      'ID phiên chat cần tiếp tục (không truyền thì server tạo phiên mới)',
  })
  @IsUUID()
  @IsOptional()
  sessionId?: string;

  @ApiPropertyOptional({
    description:
      'ID nhân vật AI cụ thể (nếu không truyền sẽ dùng Active Character)',
  })
  @IsString()
  @IsOptional()
  characterId?: string;
}
