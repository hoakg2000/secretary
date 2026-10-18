import { PartialType } from '@nestjs/swagger';
import { CreateEventDto } from './create-event.dto';

// skipNullProperties: false -> null trên title/startTime/endTime (cột không nullable) bị validator chặn (400);
// các trường @IsOptional ở Create (cột nullable) vẫn nhận null để xóa giá trị
export class UpdateEventDto extends PartialType(CreateEventDto, {
  skipNullProperties: false,
}) {}
