import { InjectQueue } from '@nestjs/bullmq';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Queue } from 'bullmq';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateEmailRuleDto } from './dto/create-email-rule.dto';
import { EmailWebhookDto } from './dto/email-webhook.dto';
import { UpdateEmailRuleDto } from './dto/update-email-rule.dto';
import { EmailRuleService } from './email-rule.service';
import { EmailService } from './email.service';

@ApiTags('Email & Rules')
@Controller('api/v1')
export class EmailController {
  constructor(
    private readonly emailService: EmailService,
    private readonly emailRuleService: EmailRuleService,
    @InjectQueue('email-processing') private readonly emailQueue: Queue,
  ) {}

  // ==========================================
  // WEBHOOK INGESTION
  // ==========================================

  @ApiOperation({
    summary: 'Đón Webhook nhận email mới từ Google Pub/Sub hoặc Trigger Manual',
  })
  @ApiResponse({
    status: 200,
    description: 'Email đã được ghi nhận và đưa vào hàng đợi xử lý ngầm',
  })
  @ApiResponse({
    status: 409,
    description: 'Email trùng lặp (Idempotent check failed)',
  })
  @Post('email/webhook')
  @HttpCode(HttpStatus.OK)
  async handleEmailWebhook(@Body() dto: EmailWebhookDto) {
    // 1. Lưu EmailLog với trạng thái PENDING và kiểm tra trùng lặp (dedupHash)
    const emailLog = await this.emailService.createEmailLog(dto);

    if (!emailLog) {
      return {
        statusCode: HttpStatus.OK,
        message: 'Email đã tồn tại trong hệ thống (bỏ qua xử lý trùng lặp)',
        data: null,
      };
    }

    // 2. Đẩy Job vào hàng đợi BullMQ để Worker tự động xử lý
    const job = await this.emailQueue.add('process-email-job', {
      emailLogId: emailLog.id,
      messageId: emailLog.messageId,
      sender: emailLog.sender,
      subject: emailLog.subject,
      rawBody: emailLog.rawBody,
    });

    return {
      statusCode: HttpStatus.OK,
      message: 'Đã tiếp nhận email và đẩy vào hàng đợi xử lý',
      data: {
        emailLogId: emailLog.id,
        jobId: job.id,
      },
    };
  }

  // ==========================================
  // EMAIL RULES CRUD
  // ==========================================

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Tạo mới quy tắc lọc Email' })
  @Post('email-rules')
  @HttpCode(HttpStatus.CREATED)
  async createRule(@Body() dto: CreateEmailRuleDto) {
    const rule = await this.emailRuleService.create(dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Tạo quy tắc lọc email thành công',
      data: rule,
    };
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Lấy danh sách các quy tắc lọc Email' })
  @Get('email-rules')
  @HttpCode(HttpStatus.OK)
  async findAllRules() {
    const rules = await this.emailRuleService.findAll();
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách quy tắc lọc email thành công',
      data: rules,
    };
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Lấy thông tin chi tiết một quy tắc lọc Email' })
  @Get('email-rules/:id')
  @HttpCode(HttpStatus.OK)
  async findOneRule(@Param('id') id: string) {
    const rule = await this.emailRuleService.findOne(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy thông tin quy tắc thành công',
      data: rule,
    };
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Cập nhật quy tắc lọc Email' })
  @Patch('email-rules/:id')
  @HttpCode(HttpStatus.OK)
  async updateRule(@Param('id') id: string, @Body() dto: UpdateEmailRuleDto) {
    const rule = await this.emailRuleService.update(id, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Cập nhật quy tắc lọc email thành công',
      data: rule,
    };
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Xóa quy tắc lọc Email' })
  @Delete('email-rules/:id')
  @HttpCode(HttpStatus.OK)
  async removeRule(@Param('id') id: string) {
    await this.emailRuleService.remove(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Xóa quy tắc lọc email thành công',
      data: null,
    };
  }
}
