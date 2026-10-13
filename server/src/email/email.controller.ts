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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateEmailRuleDto } from './dto/create-email-rule.dto';
import { EmailWebhookDto } from './dto/email-webhook.dto';
import { UpdateEmailRuleDto } from './dto/update-email-rule.dto';
import { EmailRuleService } from './email-rule.service';
import { EmailService } from './email.service';

@ApiTags('Email & Rules')
@ApiBearerAuth('JWT-auth')
@Controller()
export class EmailController {
  constructor(
    private readonly emailService: EmailService,
    private readonly emailRuleService: EmailRuleService,
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
