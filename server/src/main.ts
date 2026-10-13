import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Sau reverse proxy / tunnel: req.ip (ghi lúc đăng nhập, khóa của login throttle) phải là IP client thật.
  // Số = số proxy đứng trước server; giá trị khác = danh sách IP/subnet tin cậy ('loopback', '10.0.0.0/8')
  const trustProxy = process.env.TRUST_PROXY;
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

  app.enableCors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
  });

  // --- CẤU HÌNH SWAGGER ---
  const config = new DocumentBuilder()
    .setTitle('Personalized AI Assistant API')
    .setDescription('Tài liệu API hệ thống Trợ lý AI cá nhân hóa')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Nhập Access Token vào đây',
        in: 'header',
      },
      'JWT-auth', // Tên security scheme dùng trong Controller
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
  // -------------------------

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Server is running on http://localhost:${port}`);
  console.log(`Swagger UI is available at http://localhost:${port}/api/docs`);
}
bootstrap();
