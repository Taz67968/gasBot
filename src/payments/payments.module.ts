import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { Payment } from '@/database/entities/payment.entity';
import { Order } from '@/database/entities/order.entity';
import { SettlementsController } from '@/settlements/settlements.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, Order])],
  controllers: [PaymentsController, SettlementsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
