import { IsNotEmpty, MinLength } from 'class-validator';

export class TransactionDto {
  @IsNotEmpty()
  trref: string; // Mã giao dịch

  @IsNotEmpty()
  custno: string; // Mã khách hàng

  @IsNotEmpty()
  custnm: string; // Tên khách hàng

  @IsNotEmpty()
  amount: string; // Số tiền

  @IsNotEmpty()
  currency: string; // Loại tiền tệ

  @IsNotEmpty()
  tradate: Date; // Ngày Bắt Đầu

  @IsNotEmpty()
  remark: string; // Remark

  @IsNotEmpty()
  document: string; // Chứng từ cần bổ sung

  @IsNotEmpty()
  bencust: string; // Người hưởng thụ

  @IsNotEmpty()
  esdate: Date; // Ngày nhận hàng dự kiến

  @MinLength(0)
  note: string; // Ghi chú bổ sung
}
