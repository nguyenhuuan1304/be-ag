import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../../entities/customer.entity';
import { Transaction } from '../../entities/transaction.entity';
import * as xlsx from 'xlsx';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as cron from 'node-cron';
import * as dayjs from 'dayjs';

interface CustomerWithTransactions extends Customer {
  transactions: Transaction[];
}

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
  ) { }

  async processExcel(file: Express.Multer.File): Promise<void> {
    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { raw: false, header: 1 });

    const headers = data[0] as string[];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || typeof row !== 'object') continue;

      const rowData: { [key: string]: any } = {};
      headers.forEach((header, index) => {
        rowData[header] = row[index] as unknown;
      });

      const custno =
        typeof rowData['MSKH'] === 'string'
          ? rowData['MSKH'].trim()
          : typeof rowData['MSKH'] === 'number'
            ? rowData['MSKH'].toString().trim()
            : '';

      if (!custno) continue;

      const rawEmail =
        typeof rowData[' Email '] === 'string'
          ? rowData[' Email '].trim()
          : typeof rowData[' Email '] === 'number'
            ? rowData[' Email '].toString().trim()
            : '';
      const email = rawEmail.startsWith('mailto:')
        ? rawEmail.replace('mailto:', '')
        : rawEmail;

      const customerData = {
        custno,
        customer_name:
          typeof rowData['Khách hàng'] === 'string'
            ? rowData['Khách hàng'].trim()
            : '',
        email: email || '',
        contact_person:
          typeof rowData['Người liên hệ'] === 'string'
            ? rowData['Người liên hệ'].trim()
            : undefined,
        phone_number:
          typeof rowData['Số điện thoại'] === 'string'
            ? rowData['Số điện thoại'].trim()
            : undefined,
      };

      await this.customerRepository.upsert(customerData, ['custno']);
    }
  }

  async findCustomersWithTransactions(
    page: number = 1,
    pageSize: number = 10,
  ): Promise<{ customers: CustomerWithTransactions[]; total: number }> {
    const queryBuilder = this.customerRepository
      .createQueryBuilder('customer')
      .leftJoinAndSelect(
        'transaction',
        'transaction',
        'transaction.custno = customer.custno AND transaction.is_send_email = :isSendEmail',
        { isSendEmail: false },
      )
      .take(pageSize)
      .skip((page - 1) * pageSize);

    const [customers, total] = await queryBuilder.getManyAndCount();

    return { customers, total };
  }

  async findDuplicateCustomers(
    page: number = 1,
    pageSize: number = 10,
  ): Promise<{
    customers: CustomerWithTransactions[];
    total: number;
    page: number;
    lastPage: number;
  }> {
    const availableTransactions = await this.transactionRepository.find({
      where: { is_send_email: false },
      select: [
        'id',
        'custno',
        'is_send_email',
        'is_sending_email',
        'trref',
        'custnm',
        'contract_number',
        'currency',
        'amount',
        'tradate',
        'bencust',
        'expected_declaration_date',
        'remark',
      ],
    });

    const queryBuilder = this.customerRepository
      .createQueryBuilder('customer')
      .leftJoinAndSelect(
        'transaction',
        'transaction',
        'transaction.custno = customer.custno AND transaction.is_send_email = :isSendEmail',
        { isSendEmail: false },
      )
      .take(pageSize)
      .skip((page - 1) * pageSize);

    const [customers, total] = await queryBuilder.getManyAndCount();

    // Manually map transactions to customers
    for (const customer of customers) {
      customer.transactions = availableTransactions.filter(
        (tx) => tx.custno === customer.custno,
      );
    }

    for (const transaction of availableTransactions) {
      if (!transaction.is_send_email && !transaction.is_sending_email) {
        const foundCustomer = customers.find(
          (cust) => cust.custno === transaction.custno,
        );
        if (foundCustomer) {
          await this.transactionRepository.update(transaction.id, {
            is_sending_email: true,
          });
          // 2. Tính ngày gửi: expected_declaration_date - 10 ngày
          let sendDate: Date = new Date();
          if (transaction.expected_declaration_date) {
            sendDate = dayjs(transaction.expected_declaration_date)
              .subtract(10, 'day')
              .hour(8)
              .minute(0)
              .second(0)
              .millisecond(0)
              .toDate();
          }
          const now = new Date();
          if (sendDate && sendDate > now) {
            const cronTime = `${sendDate.getMinutes()} ${sendDate.getHours()} ${sendDate.getDate()} ${sendDate.getMonth() + 1} *`;
            console.log(`⏰ Gửi email giao dịch cho ${foundCustomer.email} lúc ${sendDate.toLocaleString()}`);
            cron.schedule(cronTime, () => {
              this.sendEmail(
                'nguyenhuuan1304@gmail.com',
                foundCustomer.email,
                'Thông báo giao dịch'
              ).then(() => {
                // Cập nhật is_send_email
                this.transactionRepository.update(transaction.id, {
                  is_send_email: true,
                });
              })
                .catch((error) => {
                  console.error("Error sending email:", error);
                });
            });
          } else {
            this.sendEmail(
              'nguyenhuuan1304@gmail.com',
              foundCustomer.email,
              'Thông báo giao dịch'
            ).then(() => {
              // Cập nhật is_send_email
              this.transactionRepository.update(transaction.id, {
                is_send_email: true,
              });
            })
            .catch((error) => {
              console.error("Error sending email:", error);
            });
          }
        }
      }
    }

    return { customers, total, page, lastPage: Math.ceil(total / pageSize) };
  }

  // Hàm gửi email
  async sendEmail(from: string, to: string, subject: string) {
    console.log(`Sending email from ${from} to ${to} with subject: ${subject}`);
    const html = fs.readFileSync('src/modules/customers/buildHtml.html', 'utf8');

    let transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: "nguyenhuuan1304@gmail.com",
        pass: "bameltmcljiaoqan",
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    let info = await transporter.sendMail({
      from: from,
      to: to,
      subject: subject,
      html: html, // hoặc html: "<h3>Xin chào, đây là email thông báo!</h3>"
    });

    console.log("Email sent: %s", info.messageId);
  }
}
