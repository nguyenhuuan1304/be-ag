import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerController } from './customers.controller';
import { CustomerService } from './customers.service';
import { Customer } from '../../entities/customer.entity';
import { Transaction } from '../../entities/transaction.entity';
import { ConfigEmail } from 'src/entities/configEmail.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Customer, Transaction, ConfigEmail])],
  controllers: [CustomerController],
  providers: [CustomerService],
})
export class CustomerModule {}
