import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateCategoryDto } from './create-category.dto';

// Không đổi loại: các giao dịch đang gắn danh mục sẽ lệch loại
export class UpdateCategoryDto extends PartialType(
  OmitType(CreateCategoryDto, ['type'] as const),
) {}
