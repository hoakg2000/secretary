import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AiAgentModule } from '../ai-agent/ai-agent.module';
import { AuthModule } from '../auth/auth.module';
import { CalendarModule } from '../calendar/calendar.module';
import { FinanceModule } from '../finance/finance.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProactiveModule } from '../proactive/proactive.module';
import { EmailAiService } from './email-ai.service';
import { EmailRuleService } from './email-rule.service';
import { EmailController } from './email.controller';
import { EmailProcessor } from './email.processor';
import { EmailService } from './email.service';
import { EmailTools } from './email.tools';
import { GmailPushService } from './gmail-push.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AiAgentModule,
    FinanceModule,
    CalendarModule,
    ProactiveModule,
    BullModule.registerQueue({
      name: 'email-processing',
    }),
  ],
  controllers: [EmailController],
  providers: [
    EmailService,
    EmailRuleService,
    EmailProcessor,
    EmailAiService,
    GmailPushService,
    EmailTools,
  ],
  exports: [EmailService, EmailRuleService],
})
export class EmailModule {}
