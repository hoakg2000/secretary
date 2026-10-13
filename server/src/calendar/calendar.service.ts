import { Injectable, NotFoundException } from '@nestjs/common';
import { AiTool } from '../common/decorators/ai-tool.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { QueryCalendarDto } from './dto/query-calendar.dto';
import { UpdateEventDto } from './dto/update-event.dto';

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * AI Tool: Tạo sự kiện lịch mới
   */
  @AiTool({
    name: 'create_calendar_event',
    description: 'Tạo một sự kiện hoặc lời nhắc mới vào Lịch của người dùng.',
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
  async createEvent(createEventDto: CreateEventDto) {
    const {
      title,
      description,
      location,
      startTime,
      endTime,
      attendees,
      intent,
      priorityStatus,
    } = createEventDto;

    const event = await this.prisma.localCalendar.create({
      data: {
        title,
        description,
        location,
        startTime,
        endTime,
        attendees,
        intent,
        priorityStatus,
        syncState: {
          create: {
            syncStatus: 'DIRTY',
          },
        },
      },
      include: {
        syncState: true,
      },
    });

    return event;
  }

  /**
   * AI Tool: Truy vấn danh sách sự kiện lịch
   */
  @AiTool({
    name: 'get_calendar_events',
    description:
      'Truy vấn danh sách các sự kiện lịch của người dùng theo khoảng thời gian.',
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
  async getEvents(queryDto: QueryCalendarDto) {
    const { fromDate, toDate } = queryDto;

    const whereCondition: any = {};

    if (fromDate || toDate) {
      whereCondition.startTime = {};
      if (fromDate) {
        whereCondition.startTime.gte = fromDate;
      }
      if (toDate) {
        whereCondition.startTime.lte = toDate;
      }
    }

    const events = await this.prisma.localCalendar.findMany({
      where: whereCondition,
      orderBy: {
        startTime: 'asc',
      },
      include: {
        syncState: true,
      },
    });

    return events;
  }

  /**
   * Lấy chi tiết 1 sự kiện lịch
   */
  async getEventById(id: string) {
    const event = await this.prisma.localCalendar.findUnique({
      where: { id },
      include: {
        syncState: true,
      },
    });

    if (!event) {
      throw new NotFoundException(`Không tìm thấy sự kiện với ID: ${id}`);
    }

    return event;
  }

  /**
   * AI Tool: Cập nhật sự kiện lịch
   */
  @AiTool({
    name: 'update_calendar_event',
    description: 'Cập nhật thông tin chi tiết của một sự kiện lịch đã tồn tại.',
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
  async updateEvent(id: string, updateEventDto: UpdateEventDto) {
    await this.getEventById(id);

    const updatedEvent = await this.prisma.localCalendar.update({
      where: { id },
      data: {
        ...updateEventDto,
        syncState: {
          upsert: {
            create: {
              syncStatus: 'DIRTY',
            },
            update: {
              syncStatus: 'DIRTY',
            },
          },
        },
      },
      include: {
        syncState: true,
      },
    });

    return updatedEvent;
  }

  /**
   * AI Tool: Xóa sự kiện lịch
   */
  @AiTool({
    name: 'delete_calendar_event',
    description: 'Xóa một sự kiện lịch khỏi hệ thống.',
    parameters: {
      id: {
        type: 'string',
        description: 'ID của sự kiện lịch cần xóa',
        required: true,
      },
    },
  })
  async deleteEvent(id: string) {
    await this.getEventById(id);

    await this.prisma.localCalendar.delete({
      where: { id },
    });

    return { success: true };
  }
}
