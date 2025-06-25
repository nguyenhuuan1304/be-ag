import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../../entities/customer.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Customer])],
  exports: [TypeOrmModule], // Export TypeOrmModule to make CustomerRepository available
})
export class CustomersModule {}
