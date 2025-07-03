import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, LessThan, MoreThanOrEqual, Raw } from 'typeorm';
import { Transaction } from '../../entities/transaction.entity';
import * as XLSX from 'xlsx';
import { format, isValid, parse } from 'date-fns';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private transactionsRepository: Repository<Transaction>,
  ) {}

  async importFromExcel(rawData: any[]): Promise<number> {
    const transactions: Partial<Transaction>[] = [];
    const errors: string[] = [];
    const trrefSet: Set<string> = new Set();

    for (const [index, row] of rawData.entries()) {
      try {
        // Required field check
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

        // Skip duplicate Trref in batch
        if (trrefSet.has(row.Trref)) {
          continue;
        }
        trrefSet.add(row.Trref);

        // Check existing in DB
        const existingTransaction = await this.transactionsRepository.findOne({
          where: { trref: row.Trref },
        });
        if (existingTransaction) {
          continue;
        }

        // Parse dates
        const tradate = this.parseDateFromExcel(row.Tradate);
        if (row.Tradate && !tradate) {
          errors.push(
            `Row ${index + 2}: Invalid Tradate format (${row.Tradate})`,
          );
          continue;
        }

        const esdate = this.parseDateFromExcel(row.Esdate);
        if (row.Esdate && !esdate) {
          errors.push(
            `Row ${index + 2}: Invalid Esdate format (${row.Esdate})`,
          );
          continue;
        }

        let additionalDate: Date | null = null;
        if (esdate) {
          additionalDate = new Date(esdate);
          additionalDate.setDate(esdate.getDate() + 30);
          additionalDate.setHours(12); // giữ giờ cố định
        }

        // Contract extraction
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

        // Create transaction
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

    if (errors.length > 0) {
      throw new BadRequestException(`Validation errors: ${errors.join('; ')}`);
    }

    if (transactions.length > 0) {
      await this.transactionsRepository.save(transactions);
    }

    return transactions.length;
  }

  parseDateFromExcel(rawValue: any): Date | null {
    try {
      // Handle Date objects
      if (rawValue instanceof Date && !isNaN(rawValue.getTime())) {
        return new Date(
          rawValue.getFullYear(),
          rawValue.getMonth(),
          rawValue.getDate(),
          12,
        );
      }

      // Handle Excel serial numbers
      if (typeof rawValue === 'number') {
        const dateObj = XLSX.SSF.parse_date_code(rawValue);
        return new Date(dateObj.y, dateObj.m - 1, dateObj.d, 12);
      }

      // Handle string dates with explicit dd/MM/yyyy format
      if (typeof rawValue === 'string') {
        const parsed = parse(rawValue, 'dd/MM/yyyy', new Date());
        if (isValid(parsed)) {
          return new Date(
            parsed.getFullYear(),
            parsed.getMonth(),
            parsed.getDate(),
            12,
          );
        }
      }

      return null;
    } catch (_) {
      return null;
    }
  }

  async findAllPaginated(page: number, limit: number, search?: string) {
    const where = search ? { custnm: Like(`%${search}%`) } : {};

    const [results, total] = await this.transactionsRepository.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { updated_at: 'ASC' },
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
      order: { updated_at: 'ASC' },
    });

    return {
      data: results,
      total,
      page,
      lastPage: Math.ceil(total / limit),
    };
  }

  // Hậu Kiểm với điều kiện tìm kiếm theo trạng thái
  async findByStatusHK(page: number, limit: number, search?: string) {
    const condition: any = [];

    condition.push({
      status: 'Đã bổ sung',
      censored: true,
    });
    if (search) {
      condition.custnm = Raw((alias) => `LOWER(${alias}) LIKE :search`, {
        search: `%${search.toLowerCase()}%`,
      });
    }

    const [results, total] = await this.transactionsRepository.findAndCount({
      where: condition,
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
      order: { updated_at: 'ASC' },
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
      order: { updated_at: 'ASC' },
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
      order: { updated_at: 'ASC' },
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
      hau_kiem: t.post_inspection ? 'Đã hậu kiểm' : 'Chưa hậu kiểm',
      ngay_nhan_hang_du_kien: t.expected_declaration_date
        ? format(t.expected_declaration_date, 'dd/MM/yyyy')
        : '',
      ngay_bo_sung_chung_tu_du_kien: t.additional_date
        ? format(t.additional_date, 'dd/MM/yyyy')
        : '',
      ghi_chu: t.note_inspection || '',
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

  async updateCustomerForKSV(
    id: number,
    updateData: { status?: string; note_censored?: string; censored?: boolean },
    user: { id: number; fullName: string; role: string },
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
      note_censored:
        updateData.note_censored !== undefined
          ? updateData.note_censored
          : transaction.note_censored,
      censored:
        updateData.censored !== undefined
          ? updateData.censored
          : transaction.censored,
      updated_by: user.fullName,
      updated_at: new Date(),
    };

    await this.transactionsRepository.save(updatedTransaction);

    return updatedTransaction;
  }

  async updateCustomerForHK(
    id: number,
    updateData: {
      status?: string;
      note_inspection?: string;
      post_inspection?: boolean;
    },
    user: { id: number; fullName: string; role: string },
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
      note_inspection:
        updateData.note_inspection !== undefined
          ? updateData.note_inspection
          : transaction.note_inspection,
      post_inspection:
        updateData.post_inspection !== undefined
          ? updateData.post_inspection
          : transaction.post_inspection,
      updated_by: user.fullName,
      updated_at: new Date(),
    };

    await this.transactionsRepository.save(updatedTransaction);

    return updatedTransaction;
  }
}
