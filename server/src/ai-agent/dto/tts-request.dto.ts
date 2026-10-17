import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class TtsRequestDto {
  @ApiProperty({
    description:
      'ID tin nhắn cần phát âm thanh (đọc bản tiếng Nhật `contentJp`); giọng lấy từ Character của phiên chat chứa tin nhắn',
  })
  @IsUUID()
  @IsNotEmpty()
  messageId: string;
}
