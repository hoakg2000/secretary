import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';

/** Cấu hình HTTP dùng chung cho main.ts và các lần khởi động app khác (e2e) */
export function configureApp(app: NestExpressApplication) {
  // Sau reverse proxy / tunnel: req.ip (ghi lúc đăng nhập, khóa của login throttle) phải là IP client thật.
  // Số = số proxy đứng trước server; giá trị khác = danh sách IP/subnet tin cậy ('loopback', '10.0.0.0/8')
  const config = app.get(ConfigService);
  const trustProxy = config.get<string>('TRUST_PROXY');
  if (trustProxy) {
    app.set(
      'trust proxy',
      /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy,
    );
  }

  app.use(helmet());
  app.use(cookieParser());
  // Mọi controller nằm dưới /api/v1 (trừ GET /). Cookie refresh token dùng path /api/v1/auth
  app.setGlobalPrefix('api/v1', { exclude: ['/'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor(new Reflector()));

  app.enableCors({
    origin: config.getOrThrow<string>('CLIENT_URL'),
    credentials: true,
  });
}
