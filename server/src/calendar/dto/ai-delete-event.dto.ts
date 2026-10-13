import { IsUUID } from 'class-validator';

export class AiDeleteEventDto {
  @IsUUID()
  id: string;
}
