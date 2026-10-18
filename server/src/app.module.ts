import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AiAgentModule } from './ai-agent/ai-agent.module';
import { AppController } from './app.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { CalendarModule } from './calendar/calendar.module';
import { CharacterModule } from './character/character.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { validate } from './config/env.validation';
import { EmailModule } from './email/email.module';
import { FinanceModule } from './finance/finance.module';
import { LlmModule } from './llm/llm.module';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProactiveModule } from './proactive/proactive.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    ScheduleModule.forRoot(),
    // Chỉ áp dụng ở route gắn ThrottlerGuard (đăng nhập): 5 lần / phút / IP
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }]),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
        },
        // undefined giữ prefix mặc định của BullMQ
        prefix: configService.get<string>('BULLMQ_PREFIX') || undefined,
      }),
      inject: [ConfigService],
    }),
    PrismaModule,
    AuthModule,
    LlmModule,
    CharacterModule,
    EmailModule,
    FinanceModule,
    CalendarModule,
    AiAgentModule,
    ProactiveModule,
  ],
  controllers: [AppController],
  providers: [
    // Mọi route đều yêu cầu JWT, trừ route gắn @Public()
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
