import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../../entities/customer.entity';
import { Transaction } from '../../entities/transaction.entity';
import * as xlsx from 'xlsx';

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
        'trref',
        'custnm',
        'contract_number',
        'currency',
        'amount',
        'tradate',
        'bencust',
        'expected_declaration_date',
        'tradate',
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

    return { customers, total, page, lastPage: Math.ceil(total / pageSize) };
  }
}
