import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class LogoutDto {
  @ApiPropertyOptional({
    description:
      'ID phiên cần kết thúc (của chính user). Bỏ trống để đăng xuất phiên hiện tại',
  })
  @IsUUID()
  @IsOptional()
  sessionId?: string;
}
