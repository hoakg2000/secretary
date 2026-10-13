import { IsUUID } from 'class-validator';
import { UpdateEventDto } from './update-event.dto';

export class AiUpdateEventDto extends UpdateEventDto {
  @IsUUID()
  id: string;
}
