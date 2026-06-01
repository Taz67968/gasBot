import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderService } from './order.service';
import { Order } from '@/database/entities/order.entity';
import { Payment } from '@/database/entities/payment.entity';
import { Customer } from '@/database/entities/customer.entity';
import { CustomerModule } from '@/customer/customer.module';

@Module({
  imports: [TypeOrmModule.forFeature([Order, Payment, Customer]), CustomerModule],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
