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
    const trrefSet: Set<string> = new Set(); // To track Trref values in the current batch

    for (const [index, row] of rawData.entries()) {
      try {
        // Check for missing required fields
        if (
          !row.Trref ||
          !row.Custno ||
          !row.Custnm ||
          !row.Currency ||
          !row.Amount ||
          !row.bencust ||
          !row.document
        ) {
          errors.push(`Row ${index + 2}: Missing required fields`);
          continue;
        }

        // Skip duplicate Trref in the current batch
        if (trrefSet.has(row.Trref)) {
          continue; // Silently skip duplicate Trref
        }
        trrefSet.add(row.Trref);

        // Optional: Skip if Trref already exists in the database
        const existingTransaction = await this.transactionsRepository.findOne({
          where: { trref: row.Trref },
        });
        if (existingTransaction) {
          continue; // Silently skip if Trref exists in the database
        }

        let tradate: Date | null = null;
        let esdate: Date | null = null;
        let additionalDate: Date | null = null;

        // Handle Tradate
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

        // Handle Esdate
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
            // Calculate additional_date (esdate + 30 days)
            additionalDate = new Date(esdate);
            additionalDate.setDate(esdate.getDate() + 30);
          } catch {
            errors.push(
              `Row ${index + 2}: Invalid Esdate format (${row.Esdate})`,
            );
            continue;
          }
        }

        // Handle contract extraction
        const contractMatch = row.remark?.match(/HD\s+([^\s,]+)/i);
        const contract_number = contractMatch ? contractMatch[1] : null;

        let contract: string;
        if (row.remark) {
          const contractFullMatch = row.remark.match(/HD\s+[^,]+/i);
          if (contractFullMatch) {
            contract = contractFullMatch[0];
          } else {
            errors.push(
              `Row ${index + 2}: Invalid or missing contract format in remark (${row.remark})`,
            );
            continue;
          }
        } else {
          errors.push(`Row ${index + 2}: Missing remark field for contract`);
          continue;
        }

        // Create transaction object
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
          contract,
          expected_declaration_date: esdate,
          additional_date: additionalDate,
          status: 'Chưa bổ sung',
          censored: false,
          post_inspection: false,
          document: row.document,
          is_document_added: false,
          is_send_email: false,
          is_sending_email: false,
        };

        transactions.push(transaction);
      } catch (error) {
        errors.push(
          `Row ${index + 2}: Error processing row - ${error.message}`,
        );
      }
    }

    // Throw errors only for non-duplicate-related validation issues
    if (errors.length > 0) {
      throw new BadRequestException(`Validation errors: ${errors.join('; ')}`);
    }

    // Save valid transactions to the database
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
      order: { updated_at: 'DESC' },
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
      order: { updated_at: 'DESC' },
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
      so_giao_dich: t.trref,
      ma_khach_hang: t.custno,
      ten_khach_hang: t.custnm,
      ngay_giao_dich: t.tradate ? format(t.tradate, 'dd/MM/yyyy') : '',
      loai_tien: t.currency,
      so_tien: t.amount,
      nguoi_huong_thu: t.bencust,
      remark: t.remark,
      ngay_nhan_hang_du_kien: t.expected_declaration_date
        ? format(t.expected_declaration_date, 'dd/MM/yyyy')
        : '',
      trang_thai: t.status,
      gui_mail: t.is_send_email ? 'Đã gửi' : 'Chưa gửi',
      ghi_chu: t.note || '',
      // ContactPerson: t.customer?.contact_person || '',
      // PhoneNumber: t.customer?.phone_number || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Transactions');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  async exportPostInspectionToExcel(postInspection: boolean): Promise<Buffer> {
    const transactions = await this.transactionsRepository.find({
      where: {
        post_inspection: postInspection,
        censored: true,
        status: 'Đã bổ sung',
      },
      relations: ['customer'],
    });

    const data = transactions.map((t) => ({
      so_giao_dich: t.trref,
      ma_khach_hang: t.custno,
      ten_khach_hang: t.custnm,
      so_tien: t.amount,
      loai_tien: t.currency,
      ngay_giao_dich: t.tradate ? format(t.tradate, 'dd/MM/yyyy') : '',
      remark: t.remark,
      chung_tu_can_bo_sung: t.document,
      hau_duyet: t.post_inspection ? 'Đã hậu kiểm' : 'Chưa hậu kiểm',
      ngay_nhan_hang_du_kien: t.expected_declaration_date
        ? format(t.expected_declaration_date, 'dd/MM/yyyy')
        : '',
      ngay_bo_sung_chung_tu_du_kien: t.additional_date
        ? format(t.additional_date, 'dd/MM/yyyy')
        : '',
      ghi_chu: t.note || '',
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
