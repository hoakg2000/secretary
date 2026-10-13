import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class AdjustBalanceDto {
  @ApiProperty({ example: 5250000, description: 'Số dư thực tế mới' })
  @IsNumber({ maxDecimalPlaces: 2 })
  newBalance: number;

  @ApiPropertyOptional({
    example: 'Đối soát sao kê tháng 10',
    description: 'Ghi chú cho bút toán điều chỉnh',
  })
  @IsString()
  @IsOptional()
  note?: string;
}
