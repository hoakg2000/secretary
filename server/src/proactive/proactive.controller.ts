import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TriggerProactiveDto } from './dto/trigger-proactive.dto';
import { ProactiveService } from './proactive.service';

@ApiTags('Proactive Agent')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/proactive')
export class ProactiveController {
  constructor(private readonly proactiveService: ProactiveService) {}

  @ApiOperation({
    summary: 'Kích hoạt thông báo / hành động chủ động (Proactive Trigger)',
    description:
      'Đánh giá ngữ cảnh và gửi thông báo qua Telegram hoặc Push Notification dựa trên loại trigger và dữ liệu gửi lên.',
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
  async triggerProactive(@Body() dto: TriggerProactiveDto) {
    const data = await this.proactiveService.evaluateAndTrigger(dto);
    return {
      statusCode: HttpStatus.OK,
      // data.result.status cho biết thông báo đã gửi thật (SENT) hay mới chỉ ghi log (LOGGED)
      message: 'Đã xử lý trigger thông báo chủ động',
      data,
    };
  }
}
