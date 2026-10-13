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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CalendarService } from './calendar.service';
import { CreateEventDto } from './dto/create-event.dto';
import { QueryCalendarDto } from './dto/query-calendar.dto';
import { UpdateEventDto } from './dto/update-event.dto';

@ApiTags('Calendar')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('api/v1/calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @ApiOperation({ summary: 'Tạo mới sự kiện lịch cục bộ' })
  @ApiResponse({
    status: 201,
    description: 'Tạo sự kiện thành công',
  })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createEvent(@Body() createEventDto: CreateEventDto) {
    const data = await this.calendarService.createEvent(createEventDto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Tạo sự kiện lịch thành công',
      data,
    };
  }

  @ApiOperation({ summary: 'Lấy danh sách các sự kiện lịch cục bộ' })
  @ApiResponse({
    status: 200,
    description: 'Lấy danh sách sự kiện lịch thành công',
  })
  @Get()
  @HttpCode(HttpStatus.OK)
  async getEvents(@Query() queryDto: QueryCalendarDto) {
    const data = await this.calendarService.getEvents(queryDto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách sự kiện lịch thành công',
      data,
    };
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
  @HttpCode(HttpStatus.OK)
  async getEventById(@Param('id') id: string) {
    const data = await this.calendarService.getEventById(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy thông tin sự kiện lịch thành công',
      data,
    };
  }

  @ApiOperation({ summary: 'Cập nhật thông tin sự kiện lịch' })
  @ApiResponse({
    status: 200,
    description: 'Cập nhật sự kiện lịch thành công',
  })
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async updateEvent(
    @Param('id') id: string,
    @Body() updateEventDto: UpdateEventDto,
  ) {
    const data = await this.calendarService.updateEvent(id, updateEventDto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Cập nhật sự kiện lịch thành công',
      data,
    };
  }

  @ApiOperation({ summary: 'Xóa sự kiện lịch cục bộ' })
  @ApiResponse({
    status: 200,
    description: 'Xóa sự kiện lịch thành công',
  })
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteEvent(@Param('id') id: string) {
    await this.calendarService.deleteEvent(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Xóa sự kiện lịch thành công',
    };
  }
}
