import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CalendarSyncService } from './calendar-sync.service';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { CalendarTools } from './calendar.tools';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CalendarController],
  providers: [CalendarService, CalendarSyncService, CalendarTools],
  exports: [CalendarService, CalendarSyncService],
})
export class CalendarModule {}
