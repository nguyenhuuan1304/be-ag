import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as path from 'path';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Cho phép frontend gọi đến backend
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Serve React frontend từ NestJS (nếu dùng vite, dist nằm trong frontend/dist)
  app.use(express.static(path.join(__dirname, '..', '..', 'frontend', 'dist')));
  app
    .getHttpAdapter()
    .get('*', (req: express.Request, res: express.Response) => {
      res.sendFile(
        path.join(__dirname, '..', '..', 'frontend', 'dist', 'index.html'),
      );
    });

  // Lắng nghe mọi địa chỉ IP (cho phép truy cập từ máy khác)
  await app.listen(3000, '0.0.0.0');
}
bootstrap();
