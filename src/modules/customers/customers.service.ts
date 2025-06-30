import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../../entities/customer.entity';
import { Transaction } from '../../entities/transaction.entity';
import * as xlsx from 'xlsx';
import * as nodemailer from 'nodemailer';
import * as cron from 'node-cron';
import * as dayjs from 'dayjs';

interface CustomerWithTransactions extends Customer {
  transactions: Transaction[];
}

export type CustomerData = {
  trref: string;
  custno: string;
  custnm: string;
  tradate: string;
  currency: string;
  amount: number;
  bencust: string;
  contract: string;
  expected_declaration_date: string;
};

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
  ) {}

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
    isSendEmail: boolean = false,
  ): Promise<{ customers: CustomerWithTransactions[]; total: number }> {
    const queryBuilder = this.customerRepository
      .createQueryBuilder('customer')
      .where((qb) => {
        const subQuery = qb
          .subQuery()
          .select('1')
          .from('transaction', 'transaction')
          .where('transaction.custno = customer.custno')
          .andWhere(`transaction.is_send_email = ${!isSendEmail}`)
          .getQuery();
        return `NOT EXISTS ${subQuery}`;
      })
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
        'contract',
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

    const customerAvailableTransactions = customers.filter(
      (customer) => customer.transactions.length > 0,
    );
    for (const transaction of availableTransactions) {
      if (!transaction.is_send_email && !transaction.is_sending_email) {
        const foundCustomer = customerAvailableTransactions.find(
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
              .hour(10)
              .minute(0)
              .second(0)
              .millisecond(0)
              .toDate();
          }
          const now = new Date();
          if (sendDate && sendDate > now) {
            const cronTime = `${sendDate.getMinutes()} ${sendDate.getHours()} ${sendDate.getDate()} ${sendDate.getMonth() + 1} *`;
            console.log(
              `⏰ Gửi email giao dịch cho ${foundCustomer.email} lúc ${sendDate.toLocaleString()}`,
            );
            cron.schedule(cronTime, () => {
              this.sendEmail(
                'nguyenhuuan1304@gmail.com',
                foundCustomer.email,
                '[NO REPLY] Thông báo danh sách giao dịch cần bổ sung chứng từ',
                transaction,
              )
                .then(() => {
                  // Cập nhật is_send_email
                  this.transactionRepository.update(transaction.id, {
                    is_send_email: true,
                  });
                })
                .catch((error) => {
                  console.error('Error sending email:', error);
                });
            });
          } else {
            this.sendEmail(
              'nguyenhuuan1304@gmail.com',
              foundCustomer.email,
              '[NO REPLY] Thông báo danh sách giao dịch cần bổ sung chứng từ',
              transaction,
            )
              .then(() => {
                // Cập nhật is_send_email
                this.transactionRepository.update(transaction.id, {
                  is_send_email: true,
                });
              })
              .catch((error) => {
                console.error('Error sending email:', error);
              });
          }
        }
      }
    }

    return {
      customers: customerAvailableTransactions,
      total,
      page,
      lastPage: Math.ceil(total / pageSize),
    };
  }

  generateTransactionTableHtml(transaction: CustomerData): string {
    const row = `
    <tr>
      <td style="padding: 8px;">${transaction.trref}</td>
      <td style="padding: 8px;">${transaction.custno}</td>
      <td style="padding: 8px;">${transaction.custnm}</td>
      <td style="padding: 8px;">
        ${
          transaction.tradate
            ? dayjs(transaction.tradate).format('DD/MM/YYYY')
            : ''
        }
      </td>
      <td style="padding: 8px;">${transaction.currency}</td>
      <td style="padding: 8px;">${transaction.amount}</td>
      <td style="padding: 8px;">${transaction.bencust}</td>
      <td style="padding: 8px;">${transaction.contract}</td>
      <td style="padding: 8px;">
        ${
          transaction.expected_declaration_date
            ? dayjs(transaction.expected_declaration_date).format('DD/MM/YYYY')
            : ''
        }
      </td>
      <td style="padding: 8px;">
        ${dayjs(transaction.expected_declaration_date).add(30, 'day').format('DD/MM/YYYY')}
      </td>
    </tr>
  `;

    return `
    <div style="font-family: Arial, sans-serif; font-size: 14px;">
      <p>
        Kính gửi Quý khách:
        <span style="font-weight: 700;">${transaction.custnm}</span>,
      </p>
      <p>Dưới đây là danh sách giao dịch cần bổ sung chứng từ:</p>
      <table cellpadding="0" cellspacing="0" border="1" style="border-collapse: collapse; width: 100%;">
        <thead style="background-color: #f0f0f0;">
          <tr>
            <th style="padding: 8px;">Số giao dịch</th>
            <th style="padding: 8px;">Mã khách hàng</th>
            <th style="padding: 8px;">Tên khách hàng</th>
            <th style="padding: 8px;">Ngày giao dịch</th>
            <th style="padding: 8px;">Loại tiền</th>
            <th style="padding: 8px;">Số tiền</th>
            <th style="padding: 8px;">Người hưởng thụ</th>
            <th style="padding: 8px;">Số hợp đồng ngoại thương</th>
            <th style="padding: 8px;">Ngày nhận hàng dự kiến</th>
            <th style="padding: 8px;">Ngày giao hàng dự kiến</th>
          </tr>
        </thead>
        <tbody>
          ${row}
        </tbody>
      </table>
      <div style="margin-top: 20px; color: #76438b;">
        <span style="font-weight: bold; font-style: italic; display: block;">Regards,</span>
        <span style="display: block; margin-top: 4px;">.......................................</span>
        <span style="font-weight: bold; display: block; margin-top: 4px;">Nguyen Thi Thuy Tuyen (Ms.)/</span>
        <span style="display: block; margin-top: 4px;">Deputy manager - Corporate Banking Division</span>
        <span style="display: block; margin-top: 4px;">Agribank Branch 4</span>
        <span style="display: block; margin-top: 4px;">No. 196 Hoang Dieu st, Ward 8, District 4, Ho Chi Minh city, Vietnam</span>
        <span style="display: block; margin-top: 4px;">Tel: +84 28 3940 8479 (EXT: 414) Fax: +84 28 3940 8478</span>
        <span style="display: block; margin-top: 4px;">Mobile: +84 963047873</span>
        <span style="display: block; margin-top: 4px;">Email: tiennguyenthithuy6@agribank.com.vn</span>
        <span style="display: block; margin-top: 4px;">https://agribank.com.vn</span>
      </div>
    </div>
  `;
  }

  // Hàm gửi email
  async sendEmail(
    from: string,
    to: string,
    subject: string,
    data: any = {},
  ): Promise<void> {
    const htmlBody = this.generateTransactionTableHtml(data as CustomerData);

    let transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: 'nguyenhuuan1304@gmail.com',
        pass: 'bameltmcljiaoqan',
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    await transporter.sendMail({
      from: from,
      to: to,
      subject: subject,
      html: htmlBody,
    });
  }
}
