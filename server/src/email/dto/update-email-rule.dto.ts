import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, ValidateIf } from 'class-validator';
import { CreateEmailRuleDto } from './create-email-rule.dto';

// skipNullProperties: false -> null trên type/matcher/matchValue bị chặn (400); description (nullable) vẫn nhận null.
// isActive là @IsOptional ở Create nhưng cột không nullable, nên khai báo lại để null cũng bị chặn
export class UpdateEmailRuleDto extends PartialType(
  OmitType(CreateEmailRuleDto, ['isActive'] as const),
  { skipNullProperties: false },
) {
  @ApiPropertyOptional({ example: true, description: 'Bật/tắt quy tắc' })
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
