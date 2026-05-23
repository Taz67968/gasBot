import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchingService } from './matching.service';
import { MatchingProcessor } from './matching.processor';
import { MatchingResponseListener } from './matching-response.listener';
import { GeoModule } from '@/geo/geo.module';
import { WhatsappModule } from '@/whatsapp/whatsapp.module';
import { Order } from '@/database/entities/order.entity';

/**
 * MatchingModule
 * Real-time geospatial driver assignment system powered by BullMQ + PostGIS.
 */
@Module({
  imports: [
    BullModule.registerQueue({
      name: 'driver-matching',
      // Connection is automatically provided by BullMQ module (uses default Redis)
      // We rely on the global Redis URL configured via ConfigLoader in the app.
    }),
    TypeOrmModule.forFeature([Order]),
    GeoModule,
    WhatsappModule,
  ],
  providers: [
    MatchingService,
    MatchingProcessor,
    MatchingResponseListener,
  ],
  exports: [MatchingService],
})
export class MatchingModule {}
