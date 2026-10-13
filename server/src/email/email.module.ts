import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailRuleService } from './email-rule.service';
import { EmailController } from './email.controller';
import { EmailProcessor } from './email.processor';
import { EmailService } from './email.service';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: 'email-processing',
    }),
  ],
  controllers: [EmailController],
  providers: [EmailService, EmailRuleService, EmailProcessor],
  exports: [EmailService, EmailRuleService],
})
export class EmailModule {}
