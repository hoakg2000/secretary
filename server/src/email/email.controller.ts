import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { EmailRuleType } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { CreateEmailRuleDto } from './dto/create-email-rule.dto';
import { EmailWebhookDto } from './dto/email-webhook.dto';
import { ListEmailLogDto } from './dto/list-email-log.dto';
import { PubSubPushDto } from './dto/pubsub-push.dto';
import { UpdateEmailRuleDto } from './dto/update-email-rule.dto';
import { EmailRuleService } from './email-rule.service';
import { EmailService } from './email.service';
import { GmailPushService } from './gmail-push.service';

@ApiTags('Email & Rules')
@ApiBearerAuth('JWT-auth')
@Controller()
export class EmailController {
  constructor(
    private readonly emailService: EmailService,
    private readonly emailRuleService: EmailRuleService,
    private readonly gmailPushService: GmailPushService,
  ) {}

  // ==========================================
  // MANUAL INGESTION
  // ==========================================

  @ApiOperation({
    summary:
      'Nạp thủ công một email đã phân tích sẵn (cần JWT). Đây không phải webhook Google Pub/Sub',
  })
  @ApiResponse({
    status: 200,
    description:
      'Email được ghi nhận: blacklist -> SKIPPED, còn lại -> đưa vào hàng đợi. Email trùng Message-ID trả về data null',
  })
  @Post('email/ingest')
  @HttpCode(HttpStatus.OK)
  async ingestEmail(@Body() dto: EmailWebhookDto) {
    const result = await this.emailService.ingest(dto);

    if (!result) {
      return {
        statusCode: HttpStatus.OK,
        message: 'Email đã tồn tại trong hệ thống (bỏ qua xử lý trùng lặp)',
        data: null,
      };
    }

    return {
      statusCode: HttpStatus.OK,
      message: result.jobId
        ? 'Đã tiếp nhận email và đẩy vào hàng đợi xử lý'
        : 'Đã tiếp nhận email, bỏ qua do khớp Blacklist',
      data: result,
    };
  }

  // ==========================================
  // EMAIL LOGS
  // ==========================================

  @ApiOperation({ summary: 'Danh sách email log, mới nhất trước' })
  @Get('email/logs')
  @HttpCode(HttpStatus.OK)
  async listLogs(@Query() dto: ListEmailLogDto) {
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách email log thành công',
      data: await this.emailService.listLogs(dto),
    };
  }

  @ApiOperation({ summary: 'Xử lý lại một email ở trạng thái FAILED' })
  @ApiResponse({
    status: 200,
    description: 'Đã đưa email vào hàng đợi (hoặc SKIPPED nếu khớp blacklist)',
  })
  @ApiResponse({ status: 400, description: 'Email không ở trạng thái FAILED' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy email log' })
  @Post('email/logs/:id/reprocess')
  @HttpCode(HttpStatus.OK)
  async reprocess(@Param('id') id: string) {
    return {
      statusCode: HttpStatus.OK,
      message: 'Đã đưa email vào hàng đợi xử lý lại',
      data: await this.emailService.reprocess(id),
    };
  }

  // ==========================================
  // GMAIL PUB/SUB PUSH
  // ==========================================

  @ApiOperation({
    summary:
      'Webhook Google Pub/Sub push của Gmail. Không dùng JWT của ứng dụng: xác thực bằng ID token do Google ký',
  })
  @ApiResponse({ status: 200, description: 'Đã nạp xong các email mới' })
  @ApiResponse({
    status: 401,
    description: 'Thiếu hoặc sai ID token của push subscription',
  })
  @ApiResponse({
    status: 503,
    description: 'Chưa cấu hình Pub/Sub, hoặc lượt nạp trước chưa xong',
  })
  @Public()
  @Post('email/pubsub')
  @HttpCode(HttpStatus.OK)
  async gmailPush(
    @Headers('authorization') authorization: string | undefined,
    @Body() _dto: PubSubPushDto,
  ) {
    await this.gmailPushService.verifyPushToken(authorization);
    const fetched = await this.gmailPushService.runPass();
    return {
      statusCode: HttpStatus.OK,
      message: 'Đã nạp email mới từ Gmail',
      data: { fetched },
    };
  }

  // ==========================================
  // EMAIL RULES CRUD
  // ==========================================

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

  @ApiOperation({ summary: 'Lấy danh sách các quy tắc lọc Email' })
  @ApiQuery({ name: 'type', enum: EmailRuleType, required: false })
  @Get('email-rules')
  @HttpCode(HttpStatus.OK)
  async findAllRules(
    @Query('type', new ParseEnumPipe(EmailRuleType, { optional: true }))
    type?: EmailRuleType,
  ) {
    const rules = await this.emailRuleService.findAll(type);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách quy tắc lọc email thành công',
      data: rules,
    };
  }

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
