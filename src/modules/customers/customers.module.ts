import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerController } from './customers.controller';
import { CustomerService } from './customers.service';
import { Customer } from '../../entities/customer.entity';
import { Transaction } from '../../entities/transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Customer, Transaction])],
  controllers: [CustomerController],
  providers: [CustomerService],
})
export class CustomerModule {}
