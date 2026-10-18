import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module'; // Điều chỉnh theo đường dẫn thực tế
import { CharacterController } from './character.controller';
import { CharacterService } from './character.service';

@Module({
  imports: [PrismaModule],
  controllers: [CharacterController],
  providers: [CharacterService],
})
export class CharacterModule {}
