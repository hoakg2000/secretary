import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { TriggerProactiveDto } from './dto/trigger-proactive.dto';
import { ProactiveService } from './proactive.service';

@ApiTags('Proactive Agent')
@ApiBearerAuth('JWT-auth')
@Controller('proactive')
export class ProactiveController {
  constructor(private readonly proactiveService: ProactiveService) {}

  @ApiOperation({
    summary: 'Kích hoạt thông báo / hành động chủ động (Proactive Trigger)',
    description:
      'Gửi thông báo qua Telegram dựa trên loại trigger và dữ liệu gửi lên.',
  })
  @ApiResponse({
    status: 200,
    description: 'Kích hoạt thông báo chủ động thành công',
  })
  @ApiResponse({
    status: 400,
    description: 'Dữ liệu đầu vào không hợp lệ',
  })
  @ApiResponse({
    status: 401,
    description: 'Chưa xác thực JWT Token',
  })
  @Post('trigger')
  @HttpCode(HttpStatus.OK)
  // data.result.status: SENT (đã gửi thật), FAILED hoặc NOT_CONFIGURED
  @ResponseMessage('Đã xử lý trigger thông báo chủ động')
  triggerProactive(@Body() dto: TriggerProactiveDto) {
    return this.proactiveService.evaluateAndTrigger(dto);
  }
}
