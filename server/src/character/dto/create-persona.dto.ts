import { ApiProperty } from '@nestjs/swagger';
import { PersonaType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class CreatePersonaDto {
  @ApiProperty({
    enum: PersonaType,
    example: PersonaType.SYSTEM_PROMPT,
    description: 'Loại thông tin Persona',
  })
  @IsEnum(PersonaType)
  @IsNotEmpty()
  type: PersonaType;

  @ApiProperty({
    example: 'Bạn là một trợ lý AI cẩn thận, chu đáo và thân thiện.',
    description: 'Nội dung chi tiết của Persona',
  })
  @IsString()
  @IsNotEmpty()
  value: string;
}
