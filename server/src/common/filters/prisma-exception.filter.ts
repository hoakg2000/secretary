import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';

/**
 * Lỗi ràng buộc DB không còn nổi lên thành 500:
 * P2002 (trùng unique) -> 409, P2025 (không tìm thấy bản ghi) -> 404, P2003 (sai khóa ngoại) -> 400.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    switch (exception.code) {
      case 'P2002':
        return super.catch(new ConflictException('Dữ liệu đã tồn tại'), host);
      case 'P2025':
        return super.catch(new NotFoundException('Không tìm thấy dữ liệu'), host);
      case 'P2003':
        return super.catch(
          new BadRequestException('Tham chiếu tới dữ liệu không hợp lệ'),
          host,
        );
      default:
        return super.catch(exception, host);
    }
  }
}
