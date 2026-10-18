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
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CalendarSyncService } from './calendar-sync.service';
import { CalendarService } from './calendar.service';
import { CreateEventDto } from './dto/create-event.dto';
import { QueryCalendarDto } from './dto/query-calendar.dto';
import { UpdateEventDto } from './dto/update-event.dto';

@ApiTags('Calendar')
@ApiBearerAuth('JWT-auth')
@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly calendarSyncService: CalendarSyncService,
  ) {}

  @ApiOperation({
    summary:
      'Đẩy ngay các thay đổi lịch cục bộ lên Google Calendar (một chiều)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Số sự kiện đã đẩy / xóa / lỗi. data = null nếu chưa kết nối Google hoặc đang có lượt đồng bộ khác',
  })
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage((data) =>
    data
      ? 'Đồng bộ Google Calendar hoàn tất'
      : 'Bỏ qua đồng bộ (chưa kết nối Google hoặc đang có lượt đồng bộ khác)',
  )
  syncNow() {
    return this.calendarSyncService.syncLocalToGoogle();
  }

  @ApiOperation({ summary: 'Tạo mới sự kiện lịch cục bộ' })
  @ApiResponse({
    status: 201,
    description: 'Tạo sự kiện thành công',
  })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Tạo sự kiện lịch thành công')
  createEvent(@Body() createEventDto: CreateEventDto) {
    return this.calendarService.createEvent(createEventDto);
  }

  @ApiOperation({
    summary: 'Lấy các sự kiện lịch cục bộ trong một tháng',
    description:
      'Theo month (1-12) và year (2000-2100); bỏ trống = tháng/năm hiện tại theo APP_TIMEZONE. Sắp theo giờ bắt đầu.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lấy danh sách sự kiện lịch thành công',
  })
  @ApiResponse({ status: 400, description: 'month/year không hợp lệ' })
  @Get()
  @ResponseMessage('Lấy danh sách sự kiện lịch thành công')
  getEvents(@Query() queryDto: QueryCalendarDto) {
    return this.calendarService.getEvents(queryDto);
  }

  @ApiOperation({ summary: 'Lấy chi tiết 1 sự kiện lịch' })
  @ApiResponse({
    status: 200,
    description: 'Lấy thông tin sự kiện lịch thành công',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy sự kiện',
  })
  @Get(':id')
  @ResponseMessage('Lấy thông tin sự kiện lịch thành công')
  getEventById(@Param('id') id: string) {
    return this.calendarService.getEventById(id);
  }

  @ApiOperation({ summary: 'Cập nhật thông tin sự kiện lịch' })
  @ApiResponse({
    status: 200,
    description: 'Cập nhật sự kiện lịch thành công',
  })
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Cập nhật sự kiện lịch thành công')
  updateEvent(@Param('id') id: string, @Body() updateEventDto: UpdateEventDto) {
    return this.calendarService.updateEvent(id, updateEventDto);
  }

  @ApiOperation({ summary: 'Xóa sự kiện lịch cục bộ' })
  @ApiResponse({
    status: 200,
    description: 'Xóa sự kiện lịch thành công',
  })
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Xóa sự kiện lịch thành công')
  async deleteEvent(@Param('id') id: string) {
    await this.calendarService.deleteEvent(id);
  }
}
