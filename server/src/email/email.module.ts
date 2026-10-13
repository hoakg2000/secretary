import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailRuleService } from './email-rule.service';
import { GmailPushService } from './gmail-push.service';
import { EmailController } from './email.controller';
import { EmailProcessor } from './email.processor';
import { EmailService } from './email.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    BullModule.registerQueue({
      name: 'email-processing',
    }),
  ],
  controllers: [EmailController],
  providers: [EmailService, EmailRuleService, EmailProcessor, GmailPushService],
  exports: [EmailService, EmailRuleService],
})
export class EmailModule {}
