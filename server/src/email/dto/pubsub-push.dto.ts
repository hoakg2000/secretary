import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class PubSubMessageDto {
  @ApiProperty({
    description: 'Base64 của JSON { emailAddress, historyId }',
    example:
      'eyJlbWFpbEFkZHJlc3MiOiJtZUBnbWFpbC5jb20iLCJoaXN0b3J5SWQiOiIxMjMifQ==',
  })
  // Không ép @IsBase64: giá trị không được dùng, và 400 ở đây khiến Pub/Sub gửi lại mãi
  @IsString()
  @IsNotEmpty()
  data: string;

  @ApiProperty({ example: '2070443601311540' })
  @IsString()
  @IsNotEmpty()
  messageId: string;

  @ApiPropertyOptional({ example: '2026-10-13T07:00:00.000Z' })
  @IsString()
  @IsOptional()
  publishTime?: string;
}

export class PubSubPushDto {
  @ApiProperty({ type: PubSubMessageDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => PubSubMessageDto)
  message: PubSubMessageDto;

  @ApiPropertyOptional({
    example: 'projects/my-project/subscriptions/gmail-push',
  })
  @IsString()
  @IsOptional()
  subscription?: string;
}
