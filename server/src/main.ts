import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  configureApp(app);

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

  const port = app.get(ConfigService).getOrThrow<number>('PORT');
  await app.listen(port);
  console.log(`Server is running on http://localhost:${port}`);
  console.log(`Swagger UI is available at http://localhost:${port}/api/docs`);
}
bootstrap();
