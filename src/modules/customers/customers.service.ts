/* eslint-disable */
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class CustomersService implements OnModuleInit {
  private transporter: Transporter;

  onModuleInit() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: false, // chỉ nên dùng trong môi trường DEV
      },
    });
  }

  async sendMail(emailFrom?: string, emailTo?: string, subject?: string) {
    try {
      const templatePath = path.join(__dirname, 'template.html');
      const html = fs.readFileSync(templatePath, 'utf8');

      const info = await this.transporter.sendMail({
        from: emailFrom,
        to: emailTo,
        subject: subject,
        html,
      });

      console.log('✅ Email sent:', info?.messageId);
    } catch (error) {
      console.error('❌ Lỗi gửi email:', error);
    }
  }

  @Cron('0 0 10 * * *') // 10:00:00 sáng hàng ngày
  async handleDailyEmail() {
    console.log('⏰ 10h sáng: Bắt đầu gửi email...');
    await this.sendMail();
  }
}
