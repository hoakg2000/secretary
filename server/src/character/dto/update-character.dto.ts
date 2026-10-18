import { PartialType } from '@nestjs/swagger';
import { CreateCharacterDto } from './create-character.dto';

// skipNullProperties: false -> name: null bị chặn (400); các trường nullable vẫn nhận null để xóa
export class UpdateCharacterDto extends PartialType(CreateCharacterDto, {
  skipNullProperties: false,
}) {}
