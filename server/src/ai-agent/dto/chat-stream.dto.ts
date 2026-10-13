import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ChatHistoryTurnDto {
  @ApiProperty({ enum: ['user', 'model'] })
  @IsIn(['user', 'model'])
  role: 'user' | 'model';

  @ApiProperty({ description: 'Nội dung lượt hội thoại' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  text: string;
}

export class ChatStreamDto {
  @ApiProperty({ description: 'Nội dung tin nhắn / prompt từ người dùng' })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({
    description:
      'ID nhân vật AI cụ thể (nếu không truyền sẽ dùng Active Character)',
  })
  @IsString()
  @IsOptional()
  characterId?: string;

  @ApiPropertyOptional({
    type: [ChatHistoryTurnDto],
    description:
      'Các lượt hội thoại gần đây do client giữ (tối đa 20). Server không lưu phiên chat',
  })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ChatHistoryTurnDto)
  @IsOptional()
  history?: ChatHistoryTurnDto[];
}
