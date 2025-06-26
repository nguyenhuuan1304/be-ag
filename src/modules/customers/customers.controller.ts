import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Get,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CustomerService } from './customers.service';
import { Customer } from '../../entities/customer.entity';

interface CustomerWithTransactions extends Customer {
  transactions: any[];
}

@Controller('customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Post('upload-excel')
  @UseInterceptors(FileInterceptor('file'))
  async uploadExcel(@UploadedFile() file: Express.Multer.File) {
    return this.customerService.processExcel(file);
  }

  @Get('duplicates')
  async getDuplicateCustomers(
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '10',
  ): Promise<{ customers: CustomerWithTransactions[]; total: number }> {
    return this.customerService.findDuplicateCustomers(
      parseInt(page, 10),
      parseInt(pageSize, 10),
    );
  }

  @Get('with-transactions')
  async getCustomersWithTransactions(
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '10',
  ): Promise<{ customers: CustomerWithTransactions[]; total: number }> {
    return this.customerService.findCustomersWithTransactions(
      parseInt(page, 10),
      parseInt(pageSize, 10),
    );
  }
}
