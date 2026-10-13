import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AiAgentModule } from './ai-agent/ai-agent.module';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { CalendarModule } from './calendar/calendar.module';
import { CharacterModule } from './character/character.module';
import { validate } from './config/env.validation';
import { EmailModule } from './email/email.module';
import { FinanceModule } from './finance/finance.module';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProactiveModule } from './proactive/proactive.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
        },
      }),
      inject: [ConfigService],
    }),
    PrismaModule,
    AuthModule,
    CharacterModule,
    EmailModule,
    FinanceModule,
    CalendarModule,
    AiAgentModule,
    ProactiveModule,
  ],
  controllers: [AppController],
  // Mọi route đều yêu cầu JWT, trừ route gắn @Public()
  providers: [AppService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
