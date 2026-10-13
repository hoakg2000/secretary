import { PartialType } from '@nestjs/swagger';
import { CreateEmailRuleDto } from './create-email-rule.dto';

export class UpdateEmailRuleDto extends PartialType(CreateEmailRuleDto) {}
