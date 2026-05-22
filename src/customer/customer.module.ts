import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '@/database/entities/customer.entity';
import { CustomerService } from './customer.service';

/**
 * CustomerModule
 * Provides atomic customer profile management with race-condition-safe creation.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Customer])],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomerModule {}
