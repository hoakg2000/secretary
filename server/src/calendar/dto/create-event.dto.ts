import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateEventDto {
  @ApiProperty({
    description: 'Tiêu đề sự kiện',
    example: 'Họp Review SPRINT 5',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({
    description: 'Mô tả chi tiết sự kiện',
    example: 'Thảo luận về tiến độ Calendar Proxy Module',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Địa điểm tổ chức sự kiện',
    example: 'Phòng họp A / Google Meet',
  })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiProperty({
    description: 'Thời gian bắt đầu (ISO Date String)',
    example: '2026-10-15T09:00:00.000Z',
  })
  @Type(() => Date)
  @IsDate()
  @IsNotEmpty()
  startTime: Date;

  @ApiProperty({
    description: 'Thời gian kết thúc (ISO Date String)',
    example: '2026-10-15T10:00:00.000Z',
  })
  @Type(() => Date)
  @IsDate()
  @IsNotEmpty()
  endTime: Date;

  @ApiPropertyOptional({
    description: 'Danh sách người tham gia (email hoặc thông tin liên hệ)',
    example: ['hoa@example.com', 'team@example.com'],
  })
  @IsArray()
  @IsOptional()
  attendees?: any[];

  @ApiPropertyOptional({
    description: 'Mục đích/Ý định của sự kiện (dành cho AI phán đoán)',
    example: 'WORK_MEETING',
  })
  @IsString()
  @IsOptional()
  intent?: string;

  @ApiPropertyOptional({
    description: 'Độ ưu tiên của sự kiện',
    example: 'HIGH',
  })
  @IsString()
  @IsOptional()
  priorityStatus?: string;
}
