import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, LessThan, MoreThanOrEqual, Raw } from 'typeorm';
import { Transaction } from '../../entities/transaction.entity';
import * as XLSX from 'xlsx';
import { format, parse } from 'date-fns';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private transactionsRepository: Repository<Transaction>,
  ) {}

  async importFromExcel(rawData: any[]): Promise<number> {
    const transactions: Partial<Transaction>[] = [];
    const errors: string[] = [];

    for (const [index, row] of rawData.entries()) {
      try {
        if (
          !row.Trref ||
          !row.Custno ||
          !row.Custnm ||
          !row.Currency ||
          !row.Amount ||
          !row.bencust
        ) {
          errors.push(`Row ${index + 2}: Missing required fields`);
          continue;
        }

        let tradate: Date | null = null;
        let esdate: Date | null = null;

        if (row.Tradate) {
          try {
            if (row.Tradate instanceof Date && !isNaN(row.Tradate.getTime())) {
              tradate = row.Tradate;
            } else if (typeof row.Tradate === 'number') {
              const dateObj = XLSX.SSF.parse_date_code(row.Tradate);
              tradate = new Date(dateObj.y, dateObj.m - 1, dateObj.d);
            } else {
              tradate = parse(row.Tradate, 'dd/MM/yyyy', new Date());
              if (isNaN(tradate.getTime())) {
                tradate = new Date(row.Tradate);
              }
            }
            if (!tradate || isNaN(tradate.getTime())) {
              errors.push(
                `Row ${index + 2}: Invalid Tradate format (${row.Tradate})`,
              );
              continue;
            }
            tradate = new Date(
              tradate.getFullYear(),
              tradate.getMonth(),
              tradate.getDate(),
            );
          } catch {
            errors.push(
              `Row ${index + 2}: Invalid Tradate format (${row.Tradate})`,
            );
            continue;
          }
        }

        if (row.Esdate) {
          try {
            if (row.Esdate instanceof Date && !isNaN(row.Esdate.getTime())) {
              esdate = row.Esdate;
            } else if (typeof row.Esdate === 'number') {
              const dateObj = XLSX.SSF.parse_date_code(row.Esdate);
              esdate = new Date(dateObj.y, dateObj.m - 1, dateObj.d);
            } else {
              esdate = parse(row.Esdate, 'dd/MM/yyyy', new Date());
              if (isNaN(esdate.getTime())) {
                esdate = new Date(row.Esdate);
              }
            }
            if (!esdate || isNaN(esdate.getTime())) {
              errors.push(
                `Row ${index + 2}: Invalid Esdate format (${row.Esdate})`,
              );
              continue;
            }
            esdate = new Date(
              esdate.getFullYear(),
              esdate.getMonth(),
              esdate.getDate(),
            );
          } catch {
            errors.push(
              `Row ${index + 2}: Invalid Esdate format (${row.Esdate})`,
            );
            continue;
          }
        }

        const contractMatch = row.remark?.match(/HD\s+([^\s,]+)/i);
        const contract_number = contractMatch ? contractMatch[1] : null;

        const transaction: Partial<Transaction> = {
          trref: row.Trref,
          custno: row.Custno,
          custnm: row.Custnm,
          tradate,
          currency: row.Currency,
          amount: parseFloat(row.Amount.toString().replace(/,/g, '')),
          bencust: row.bencust,
          remark: row.remark,
          contract_number,
          expected_declaration_date: esdate,
          status: 'Chưa bổ sung',
          is_document_added: false,
          is_send_email: false,
        };

        transactions.push(transaction);
      } catch (error) {
        errors.push(
          `Row ${index + 2}: Error processing row - ${error.message}`,
        );
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException(`Validation errors: ${errors.join('; ')}`);
    }

    if (transactions.length > 0) {
      await this.transactionsRepository.save(transactions);
    }

    return transactions.length;
  }

  async findAllPaginated(page: number, limit: number, search?: string) {
    const where = search ? { custnm: Like(`%${search}%`) } : {};

    const [results, total] = await this.transactionsRepository.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { created_at: 'DESC' },
    });

    return {
      data: results,
      total,
      page,
      lastPage: Math.ceil(total / limit),
    };
  }

  async findById(id: number): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findOne({
      where: { id },
    });
    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }
    return transaction;
  }

  async findByStatus(
    status: 'Chưa bổ sung' | 'Quá hạn' | 'Đã bổ sung',
    page: number,
    limit: number,
    search?: string,
  ) {
    const today = new Date();
    const conditions: any = [];

    if (status === 'Quá hạn') {
      conditions.push({
        expected_declaration_date: LessThan(today),
        status: 'Chưa bổ sung',
      });
    } else if (status === 'Chưa bổ sung') {
      conditions.push({
        expected_declaration_date: MoreThanOrEqual(today),
        status: 'Chưa bổ sung',
      });
    } else if (status === 'Đã bổ sung') {
      conditions.push({
        status: 'Đã bổ sung',
      });
    } else {
      throw new BadRequestException('Invalid status');
    }

    if (search) {
      const searchLower = search.toLowerCase();
      conditions.forEach((condition: any) => {
        condition.custnm = Raw(
          (alias) => `LOWER(${alias}) LIKE '%${searchLower}%'`,
        );
      });
    }

    const [results, total] = await this.transactionsRepository.findAndCount({
      where: conditions,
      skip: (page - 1) * limit,
      take: limit,
      order: { created_at: 'DESC' },
    });

    return {
      data: results,
      total,
      page,
      lastPage: Math.ceil(total / limit),
    };
  }

  async findEmailSent(page: number, limit: number, search?: string) {
    const where: any = { is_send_email: true };
    if (search) {
      where.custnm = Like(`%${search}%`);
    }

    const [results, total] = await this.transactionsRepository.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { created_at: 'DESC' },
    });

    return {
      data: results,
      total,
      page,
      lastPage: Math.ceil(total / limit),
    };
  }

  async exportToExcel(status: 'Chưa bổ sung' | 'Quá hạn'): Promise<Buffer> {
    const transactions = await this.transactionsRepository.find({
      where:
        status === 'Quá hạn'
          ? {
              expected_declaration_date: LessThan(new Date()),
              status: 'Chưa bổ sung',
            }
          : {
              status: 'Chưa bổ sung',
              expected_declaration_date: MoreThanOrEqual(new Date()),
            },
      relations: ['customer'],
    });

    const data = transactions.map((t) => ({
      Trref: t.trref,
      Custno: t.custno,
      Custnm: t.custnm,
      Tradate: t.tradate ? format(t.tradate, 'dd/MM/yyyy') : '',
      Currency: t.currency,
      Amount: t.amount,
      bencust: t.bencust,
      remark: t.remark,
      Esdate: t.expected_declaration_date
        ? format(t.expected_declaration_date, 'dd/MM/yyyy')
        : '',
      Status: t.status,
      IsSendEmail: t.is_send_email,
      ContactPerson: t.customer?.contact_person || '',
      PhoneNumber: t.customer?.phone_number || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Transactions');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  async updateCustomer(
    id: number,
    updateData: { status?: string; note?: string },
    user: { id: number; fullName: string },
  ) {
    const transaction = await this.transactionsRepository.findOne({
      where: { id },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }

    const updatedTransaction = {
      ...transaction,
      status: updateData.status || transaction.status,
      note: updateData.note !== undefined ? updateData.note : transaction.note,
      updated_by: user.fullName,
      updated_at: new Date(),
    };

    await this.transactionsRepository.save(updatedTransaction);

    return updatedTransaction;
  }
}
