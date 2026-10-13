import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProactiveController } from './proactive.controller';
import { ProactiveService } from './proactive.service';
import { TelegramClient } from './telegram.client';

@Module({
  imports: [PrismaModule],
  controllers: [ProactiveController],
  providers: [ProactiveService, TelegramClient],
  exports: [ProactiveService],
})
export class ProactiveModule {}
