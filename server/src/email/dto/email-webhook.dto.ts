import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class EmailWebhookDto {
  @ApiProperty({
    example: '<123456789.abcdef@mail.gmail.com>',
    description: 'Unique Message-ID từ Gmail',
  })
  @IsString()
  @IsNotEmpty()
  messageId: string;

  @ApiProperty({
    example: 'Vietcombank <no-reply@vietcombank.com.vn>',
    description: 'Thông tin người gửi',
  })
  @IsString()
  @IsNotEmpty()
  sender: string;

  @ApiPropertyOptional({
    example: 'Thông báo biến động số dư tài khoản',
    description: 'Tiêu đề email',
  })
  @IsString()
  @IsOptional()
  subject?: string;

  @ApiPropertyOptional({
    example: 'Tài khoản 1012345678 thay đổi +500,000 VND...',
    description: 'Nội dung raw body của email',
  })
  @IsString()
  @IsOptional()
  rawBody?: string;
}
