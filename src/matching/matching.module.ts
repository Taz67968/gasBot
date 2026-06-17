import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchingService } from './matching.service';
import { MatchingProcessor } from './matching.processor';
import { MatchingResponseListener } from './matching-response.listener';
import { SupplierNotificationService } from './supplier-notification.service';
import { SupplierReminderService } from './supplier-reminder.service';
import { GeoModule } from '@/geo/geo.module';
import { WhatsappModule } from '@/whatsapp/whatsapp.module';
import { DispatchModule } from '@/dispatch/dispatch.module';
import { Order } from '@/database/entities/order.entity';
import { RedisModule } from '@/redis/redis.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'driver-matching',
    }),
    TypeOrmModule.forFeature([Order]),
    GeoModule,
    WhatsappModule,
    DispatchModule,
    RedisModule,
  ],
  providers: [
    MatchingService,
    MatchingProcessor,
    MatchingResponseListener,
    SupplierNotificationService,
    SupplierReminderService,
  ],
  exports: [MatchingService, SupplierNotificationService],
})
export class MatchingModule {}
