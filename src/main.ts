import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as path from 'path';
import * as express from 'express';
import { Request, Response, NextFunction } from 'express';

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
    origin: [
      'http://localhost:3000',
      'http://192.168.197.155:3000',
      'http://localhost:5173',
    ],
    credentials: true,
  });

  // Serve React build
  app.use(express.static(path.join(__dirname, '..', '..', 'fe-ag', 'dist')));

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/auth') || req.path.startsWith('/api')) {
      return next();
    }

    res.sendFile(
      path.join(__dirname, '..', '..', 'fe-ag', 'dist', 'index.html'),
    );
  });

  // Lắng nghe mọi địa chỉ IP (cho phép truy cập từ máy khác)
  await app.listen(3000, '0.0.0.0');
}
bootstrap();
