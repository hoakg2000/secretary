import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { QueryCalendarDto } from './dto/query-calendar.dto';
import { UpdateEventDto } from './dto/update-event.dto';

/** Giờ địa phương của `timeZone` tại thời điểm `at` (ms), dưới dạng các phần số */
function zonedParts(at: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(at);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** Thời điểm UTC của 00:00 ngày 1 của tháng `month` (1-12; 13 = tháng 1 năm sau) theo `timeZone` */
function startOfMonth(year: number, month: number, timeZone: string) {
  const local = Date.UTC(year, month - 1, 1);
  // Hai lượt để offset được tính đúng ở thời điểm kết quả (phòng giờ mùa hè)
  let at = local;
  for (let i = 0; i < 2; i++) {
    const z = zonedParts(at, timeZone);
    const offset =
      Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, z.second) -
      Math.floor(at / 1000) * 1000;
    at = local - offset;
  }
  return new Date(at);
}

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private assertValidRange(startTime: Date, endTime: Date) {
    if (endTime <= startTime) {
      throw new BadRequestException(
        'Thời gian kết thúc phải sau thời gian bắt đầu',
      );
    }
  }

  /**
   * Tạo sự kiện lịch mới (đánh dấu DIRTY để job sync đẩy lên Google)
   */
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

    this.assertValidRange(startTime, endTime);

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
   * Danh sách sự kiện giao với tháng/năm được chọn (cả tháng theo APP_TIMEZONE), sắp theo giờ bắt đầu.
   * Bỏ trống month/year = tháng/năm hiện tại.
   */
  async getEvents(queryDto: QueryCalendarDto) {
    const timeZone = this.configService.getOrThrow<string>('APP_TIMEZONE');
    const now = zonedParts(Date.now(), timeZone);
    const year = queryDto.year ?? now.year;
    const month = queryDto.month ?? now.month;

    const events = await this.prisma.localCalendar.findMany({
      where: {
        deletedAt: null,
        startTime: { lt: startOfMonth(year, month + 1, timeZone) },
        endTime: { gt: startOfMonth(year, month, timeZone) },
      },
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
    const event = await this.prisma.localCalendar.findFirst({
      where: { id, deletedAt: null },
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
   * Cập nhật sự kiện lịch
   */
  async updateEvent(id: string, updateEventDto: UpdateEventDto) {
    const existing = await this.getEventById(id);

    this.assertValidRange(
      updateEventDto.startTime ?? existing.startTime,
      updateEventDto.endTime ?? existing.endTime,
    );

    const updatedEvent = await this.prisma.localCalendar.update({
      where: { id },
      data: {
        ...updateEventDto,
        // Đổi giờ bắt đầu thì cho phép nhắc lịch lại
        ...(updateEventDto.startTime && { remindedAt: null }),
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
   * Xóa sự kiện lịch.
   * Đã có trên Google -> xóa mềm + DIRTY để job sync xóa trên Google rồi mới xóa hẳn.
   * Chưa từng đẩy lên Google -> xóa hẳn ngay.
   */
  async deleteEvent(id: string) {
    const event = await this.getEventById(id);

    if (event.syncState?.googleEventId) {
      await this.prisma.localCalendar.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          syncState: { update: { syncStatus: 'DIRTY' } },
        },
      });
    } else {
      await this.prisma.localCalendar.delete({
        where: { id },
      });
    }

    return { success: true };
  }
}
