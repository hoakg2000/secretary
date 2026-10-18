import { Controller, Get } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  // Public: để load balancer / monitor kiểm tra tiến trình còn sống, không đụng DB
  @Public()
  @Get()
  @ApiOperation({ summary: 'Health check' })
  health() {
    return { status: 'ok' };
  }
}
