import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map } from 'rxjs';
import {
  RESPONSE_MESSAGE_KEY,
  ResponseMessageValue,
} from '../decorators/response-message.decorator';

/** Bọc kết quả handler có @ResponseMessage thành { statusCode, message, data } */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const message = this.reflector.get<ResponseMessageValue | undefined>(
      RESPONSE_MESSAGE_KEY,
      context.getHandler(),
    );
    if (!message) return next.handle();

    const res = context.switchToHttp().getResponse();
    return next.handle().pipe(
      map((data) => ({
        statusCode: res.statusCode,
        message: typeof message === 'function' ? message(data) : message,
        data: data ?? null,
      })),
    );
  }
}
