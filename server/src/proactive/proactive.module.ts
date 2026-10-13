import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProactiveController } from './proactive.controller';
import { ProactiveService } from './proactive.service';

@Module({
  imports: [PrismaModule],
  controllers: [ProactiveController],
  providers: [ProactiveService],
  exports: [ProactiveService],
})
export class ProactiveModule {}
