import { Repository } from 'typeorm';
import { Transaction } from '../../entities/transaction.entity';
import * as dayjs from 'dayjs';
import { InjectRepository } from '@nestjs/typeorm';

export class TransactionsService {
  // Define status options
  private readonly statusOptions = [
    { id: 1, value: 'Chưa bổ sung' },
    { id: 2, value: 'Đã bổ sung' },
  ];

  constructor(
    @InjectRepository(Transaction)
    private transactionRepo: Repository<Transaction>,
  ) {}

  // Method to get status options
  getStatusOptions() {
    return this.statusOptions;
  }

  async importFromExcel(data: any[]) {
    const transactions: Transaction[] = [];
    const errors: string[] = [];

    for (const [index, row] of data.entries()) {
      const trref = this.safeField(row, 'Trref', '\uFEFFTrref');
      if (!trref) {
        errors.push(`Row ${index + 1}: Missing Trref`);
        continue;
      }

      const custno = this.safeField(row, 'Custno');
      if (!custno) {
        errors.push(`Row ${index + 1}: Missing Custno`);
        continue;
      }

      const custnm = this.safeField(row, 'Custnm');
      if (!custnm) {
        errors.push(`Row ${index + 1}: Missing Custnm`);
        continue;
      }

      const currency = this.safeField(row, 'Currency');
      if (!currency) {
        errors.push(`Row ${index + 1}: Missing Currency`);
        continue;
      }

      const amount = Number(this.safeField(row, 'Amount') || 0);
      if (isNaN(amount)) {
        errors.push(`Row ${index + 1}: Invalid Amount`);
        continue;
      }

      const remark = this.safeField(row, 'remark') || '';
      const remarkInfo = this.parseRemark(remark);

      const transactionData: Partial<Transaction> = {
        trref,
        custno,
        custnm,
        tradate: this.toDate(this.safeField(row, 'Tradate')),
        currency,
        amount,
        bencust: this.safeField(row, 'bencust') || '',
        remark,
        contract_number: remarkInfo.contractNumber,
        expected_delivery_date:
          this.toDate(this.safeField(row, 'Esdate')) || remarkInfo.deliveryDate,
        expected_declaration_date: remarkInfo.declarationDate,
        is_document_added: false,
        status: 'Chưa bổ sung', // Default status
        note: null,
        updated_by: null,
        updated_at: null,
      };

      try {
        const transaction = this.transactionRepo.create(transactionData);
        transactions.push(transaction);
      } catch (error) {
        errors.push(
          `Row ${index + 1}: Failed to create transaction - ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        continue;
      }
    }

    try {
      const savedTransactions = await this.transactionRepo.save(transactions, {
        chunk: 100,
      });

      return {
        success: true,
        savedCount: savedTransactions.length,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      return {
        success: false,
        errors: [
          ...errors,
          `Database error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
      };
    }
  }

  async updateTransaction(
    id: number,
    updateData: Partial<Pick<Transaction, 'status' | 'note'>>,
    updatedBy: string,
  ) {
    try {
      const transaction = await this.transactionRepo.findOne({ where: { id } });
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      // Validate status if provided
      if (
        updateData.status &&
        !this.statusOptions.some((opt) => opt.value === updateData.status)
      ) {
        throw new Error(`Invalid status value: ${updateData.status}`);
      }

      await this.transactionRepo.update(id, {
        ...updateData,
        updated_by: updatedBy,
        updated_at: new Date(),
      });

      return await this.transactionRepo.findOne({ where: { id } });
    } catch (error) {
      throw new Error(
        `Failed to update transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async findAllPaginated(page: number, limit: number, search?: string) {
    const qb = this.transactionRepo.createQueryBuilder('transaction');

    if (search) {
      qb.where(
        'transaction.custnm ILIKE :search OR transaction.trref ILIKE :search',
        {
          search: `%${search}%`,
        },
      );
    }

    qb.orderBy('transaction.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  private parseRemark(remark: string): {
    contractNumber: string | null;
    deliveryDate: Date | null;
    declarationDate: Date | null;
  } {
    const regex =
      /(In advance|Payment in advance|Deposit|TT in advance|TT trước|TT TRUOC|tạm ứng)[\s\-]*(.*?)\s*(\d{6})/i;
    const match = remark.match(regex);

    if (!match) {
      return {
        contractNumber: null,
        deliveryDate: null,
        declarationDate: null,
      };
    }

    const [, , contractNumber, yymmdd] = match;

    const deliveryDate = this.parseYYMMDD(yymmdd);
    const declarationDate = deliveryDate
      ? dayjs(deliveryDate).add(30, 'day').toDate()
      : null;

    return {
      contractNumber,
      deliveryDate,
      declarationDate,
    };
  }

  private parseYYMMDD(yymmdd: string): Date | null {
    if (!/^\d{6}$/.test(yymmdd)) return null;
    const year = +`20${yymmdd.slice(0, 2)}`;
    const month = +yymmdd.slice(2, 4) - 1;
    const day = +yymmdd.slice(4, 6);
    return new Date(year, month, day);
  }

  private toDate(value: any): Date | null {
    if (!value) return null;

    if (typeof value === 'number') {
      return new Date(Date.UTC(1899, 11, 30 + value));
    }

    return dayjs(value).isValid() ? dayjs(value).toDate() : null;
  }

  private safeField(row: any, ...keys: string[]): any {
    for (const key of keys) {
      if (row[key] !== undefined) return row[key];
    }
    return null;
  }
}
