import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum ProactiveTriggerType {
  URGENT_EVENT = 'URGENT_EVENT',
  INACTIVITY_FALLBACK = 'INACTIVITY_FALLBACK',
  SCHEDULED_REMINDER = 'SCHEDULED_REMINDER',
  CUSTOM = 'CUSTOM',
}

export enum ProactiveChannel {
  TELEGRAM = 'TELEGRAM',
  PUSH_NOTIFICATION = 'PUSH_NOTIFICATION',
  ALL = 'ALL',
}

export class TriggerProactiveDto {
  @ApiProperty({
    description: 'Loại trigger kích hoạt tác vụ chủ động',
    enum: ProactiveTriggerType,
    example: ProactiveTriggerType.URGENT_EVENT,
  })
  @IsEnum(ProactiveTriggerType)
  @IsNotEmpty()
  type: ProactiveTriggerType;

  @ApiProperty({
    description: 'Nội dung thông báo / tin nhắn cần gửi',
    example: 'Bạn có một cuộc họp quan trọng sắp diễn ra trong 15 phút tới!',
  })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({
    description: 'Kênh gửi thông báo',
    enum: ProactiveChannel,
    default: ProactiveChannel.TELEGRAM,
  })
  @IsEnum(ProactiveChannel)
  @IsOptional()
  channel?: ProactiveChannel = ProactiveChannel.TELEGRAM;

  @ApiPropertyOptional({
    description: 'Dữ liệu ngữ cảnh bổ sung (JSON string hoặc metadata)',
    example: { eventId: '123-abc', priority: 'HIGH' },
  })
  @IsOptional()
  metadata?: Record<string, any>;
}
