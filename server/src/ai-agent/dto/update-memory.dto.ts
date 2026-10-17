import { PartialType, PickType } from '@nestjs/swagger';
import { SaveMemoryDto } from './save-memory.dto';

export class UpdateMemoryDto extends PartialType(
  PickType(SaveMemoryDto, ['content', 'category'] as const),
) {}
