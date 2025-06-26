import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmConfig } from './config/typeorm.config';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { CustomerModule } from './modules/customers/customers.module';
import { AuthModule } from './modules/auth/auth.module';
import { MailerModule } from '@nestjs-modules/mailer';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // Load .env
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: typeOrmConfig,
    }),
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        transport: {
          host: configService.get<string>('SMTP_HOST', 'smtp.example.com'),
          port: configService.get<number>('SMTP_PORT', 587),
          auth: {
            user: configService.get<string>(
              'SMTP_USER',
              'your-email@example.com',
            ),
            pass: configService.get<string>('SMTP_PASS', 'your-password'),
          },
        },
      }),
    }),
    TransactionsModule,
    CustomerModule,
    AuthModule,
  ],
})
export class AppModule {}
