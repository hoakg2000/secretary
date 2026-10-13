import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { QueryCalendarDto } from './dto/query-calendar.dto';
import { UpdateEventDto } from './dto/update-event.dto';

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

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
   * Danh sách sự kiện giao với khoảng [fromDate, toDate] (bắt đầu trước toDate và kết thúc sau fromDate)
   */
  async getEvents(queryDto: QueryCalendarDto) {
    const { fromDate, toDate } = queryDto;

    const where: Prisma.LocalCalendarWhereInput = { deletedAt: null };
    if (toDate) where.startTime = { lte: toDate };
    if (fromDate) where.endTime = { gte: fromDate };

    const events = await this.prisma.localCalendar.findMany({
      where,
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
