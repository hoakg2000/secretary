import { Injectable } from '@nestjs/common';
import { AiTool } from '../common/decorators/ai-tool.decorator';
import { CalendarService } from './calendar.service';
import { AiDeleteEventDto } from './dto/ai-delete-event.dto';
import { AiUpdateEventDto } from './dto/ai-update-event.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { QueryCalendarDto } from './dto/query-calendar.dto';

/**
 * Lớp bọc giữa model và CalendarService: mỗi tool nhận một object tham số (đã validate theo DTO)
 * rồi ánh xạ sang chữ ký hàm của service.
 */
@Injectable()
export class CalendarTools {
  constructor(private readonly calendarService: CalendarService) {}

  @AiTool({
    name: 'create_calendar_event',
    description: 'Tạo một sự kiện hoặc lời nhắc mới vào Lịch của người dùng.',
    dto: CreateEventDto,
    parameters: {
      title: {
        type: 'string',
        description: 'Tiêu đề hoặc nội dung sự kiện',
        required: true,
      },
      description: {
        type: 'string',
        description: 'Mô tả chi tiết sự kiện',
        required: false,
      },
      location: {
        type: 'string',
        description: 'Địa điểm tổ chức sự kiện',
        required: false,
      },
      startTime: {
        type: 'string',
        description:
          'Thời gian bắt đầu theo định dạng ISO 8601 (ví dụ: 2026-10-15T09:00:00Z)',
        required: true,
      },
      endTime: {
        type: 'string',
        description:
          'Thời gian kết thúc theo định dạng ISO 8601 (ví dụ: 2026-10-15T10:00:00Z)',
        required: true,
      },
      intent: {
        type: 'string',
        description: 'Mục đích/Loại sự kiện (ví dụ: WORK, PERSONAL, MEETING)',
        required: false,
      },
      priorityStatus: {
        type: 'string',
        description: 'Mức độ ưu tiên (HIGH, MEDIUM, LOW)',
        required: false,
      },
    },
  })
  createCalendarEvent(dto: CreateEventDto) {
    return this.calendarService.createEvent(dto);
  }

  @AiTool({
    name: 'get_calendar_events',
    description:
      'Truy vấn danh sách các sự kiện lịch của người dùng theo khoảng thời gian.',
    dto: QueryCalendarDto,
    parameters: {
      fromDate: {
        type: 'string',
        description: 'Thời gian bắt đầu lọc theo định dạng ISO 8601',
        required: false,
      },
      toDate: {
        type: 'string',
        description: 'Thời gian kết thúc lọc theo định dạng ISO 8601',
        required: false,
      },
    },
  })
  getCalendarEvents(dto: QueryCalendarDto) {
    return this.calendarService.getEvents(dto);
  }

  @AiTool({
    name: 'update_calendar_event',
    description: 'Cập nhật thông tin chi tiết của một sự kiện lịch đã tồn tại.',
    dto: AiUpdateEventDto,
    requiresConfirmation: true,
    parameters: {
      id: {
        type: 'string',
        description: 'ID của sự kiện lịch cần cập nhật',
        required: true,
      },
      title: {
        type: 'string',
        description: 'Tiêu đề mới của sự kiện',
        required: false,
      },
      description: {
        type: 'string',
        description: 'Mô tả mới',
        required: false,
      },
      location: {
        type: 'string',
        description: 'Địa điểm mới',
        required: false,
      },
      startTime: {
        type: 'string',
        description: 'Thời gian bắt đầu mới theo định dạng ISO 8601',
        required: false,
      },
      endTime: {
        type: 'string',
        description: 'Thời gian kết thúc mới theo định dạng ISO 8601',
        required: false,
      },
    },
  })
  updateCalendarEvent({ id, ...changes }: AiUpdateEventDto) {
    return this.calendarService.updateEvent(id, changes);
  }

  @AiTool({
    name: 'delete_calendar_event',
    description: 'Xóa một sự kiện lịch khỏi hệ thống.',
    dto: AiDeleteEventDto,
    requiresConfirmation: true,
    parameters: {
      id: {
        type: 'string',
        description: 'ID của sự kiện lịch cần xóa',
        required: true,
      },
    },
  })
  deleteCalendarEvent({ id }: AiDeleteEventDto) {
    return this.calendarService.deleteEvent(id);
  }
}
