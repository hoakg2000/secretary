import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { ProactiveController } from './proactive.controller';
import { ProactiveService } from './proactive.service';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule],
  controllers: [ProactiveController],
  providers: [ProactiveService],
  exports: [ProactiveService],
})
export class ProactiveModule {}
